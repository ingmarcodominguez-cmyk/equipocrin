import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function AsistenciaPacientes({ onVolver, usuario }) {
  const [fechaTrabajo, setFechaTrabajo] = useState(
    localStorage.getItem('crin_fecha_trabajo_simulada') || new Date().toISOString().split('T')[0]
  );
  
  const [pacientesCargados, setPacientesCargados] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
  
  // Listados de mapeo para usuarios (prestadores)
  const [mapaPrestadores, setMapaPrestadores] = useState({});

  // --- NUEVO ESTADO DE TABS Y REPORTES ---
  const [activeTab, setActiveTab] = useState('diaria'); // 'diaria' o 'reporte'
  const [pacientesMap, setPacientesMap] = useState([]); // Array de objetos { id_uuid, id_paciente, nombre_apellido, dni }
  const [pacientesMotor, setPacientesMotor] = useState([]); // Listado de pacientes_motor para el dropdown
  
  // Estados de Tab 2 (Reporte)
  const [reportePacienteId, setReportePacienteId] = useState(''); // id_paciente (INT)
  const [reporteMes, setReporteMes] = useState(new Date().toISOString().substring(0, 7)); // "YYYY-MM"
  const [cargandoReporte, setCargandoReporte] = useState(false);
  const [datosReporte, setDatosReporte] = useState([]);
  const [kpiReporte, setKpiReporte] = useState(null);

  // Estados de Tab 3 (Alertas)
  const [alertaMes, setAlertaMes] = useState(new Date().toISOString().substring(0, 7)); // "YYYY-MM"
  const [alertaLimite, setAlertaLimite] = useState(60);
  const [cargandoAlertas, setCargandoAlertas] = useState(false);
  const [pacientesCriticos, setPacientesCriticos] = useState([]);

  const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  const getDiaSemana = (fechaStr) => {
    if (!fechaStr) return '';
    const d = new Date(fechaStr + 'T00:00:00');
    return diasSemana[d.getDay()];
  };

  const getTurno = (sesiones) => {
    if (!sesiones || sesiones.length === 0) return 'Tarde';
    const sortedHours = [...sesiones].sort((a, b) => a.hora.localeCompare(b.hora));
    return sortedHours[0].hora < '13:00' ? 'Mañana' : 'Tarde';
  };

  const diaSemanaNombre = getDiaSemana(fechaTrabajo);

  // Carga inicial
  useEffect(() => {
    cargarDatos();
  }, [fechaTrabajo]);

  const cargarDatos = async () => {
    setCargando(true);
    setMensaje({ texto: '', tipo: '' });
    try {
      // 1. Cargar prestadores/usuarios para resolver nombres
      const { data: usersData } = await supabase.from('users').select('id, nombre');
      const lookupPrestadores = {};
      (usersData || []).forEach(u => {
        lookupPrestadores[u.id] = u.nombre;
      });
      setMapaPrestadores(lookupPrestadores);

      // 2. Cargar listas de mapeo de pacientes
      const { data: pList, error: errP } = await supabase.from('pacientes').select('id, nombre, id_paciente_excel, dni');
      const { data: pmList, error: errPM } = await supabase.from('pacientes_motor').select('id_paciente, nombre_apellido, dni, domicilio, tel_padres, tel_alternativo');

      if (errP) throw errP;
      if (errPM) throw errPM;

      const sortedPM = (pmList || []).sort((a, b) => {
        const nameA = (a.nombre_apellido || '').trim().toLowerCase();
        const nameB = (b.nombre_apellido || '').trim().toLowerCase();
        return nameA.localeCompare(nameB);
      });
      setPacientesMotor(sortedPM);

      // Construir mapa de UUID -> INT paciente
      const listadoMapeado = [];
      const patientLookup = {};
      (pList || []).forEach(p => {
        let match = (pmList || []).find(pm => pm.id_paciente === p.id_paciente_excel);
        if (!match && p.dni) {
          const cleanDni = String(p.dni).trim();
          if (cleanDni) {
            match = (pmList || []).find(pm => pm.dni && String(pm.dni).trim() === cleanDni);
          }
        }
        if (!match && p.nombre) {
          const cleanName = p.nombre.trim().toLowerCase();
          match = (pmList || []).find(pm => pm.nombre_apellido?.trim().toLowerCase() === cleanName);
        }
        if (match) {
          patientLookup[p.id] = {
            id_paciente: match.id_paciente,
            nombre_apellido: match.nombre_apellido,
            dni: match.dni,
            domicilio: match.domicilio,
            tel_padres: match.tel_padres,
            tel_alternativo: match.tel_alternativo
          };
          listadoMapeado.push({
            id_uuid: p.id,
            id_paciente: match.id_paciente,
            nombre_apellido: match.nombre_apellido,
            dni: match.dni,
            domicilio: match.domicilio,
            tel_padres: match.tel_padres,
            tel_alternativo: match.tel_alternativo
          });
        }
      });
      setPacientesMap(listadoMapeado);

      // 3. Cargar las sesiones fijas para el día de la semana correspondiente
      const { data: sesionesData, error: errS } = await supabase
        .from('sesiones_fijas')
        .select('*')
        .eq('dia_semana', diaSemanaNombre)
        .eq('estado', 'ACTIVO');

      if (errS) throw errS;

      // Agrupar sesiones fijas por paciente y mapear a pacientes_motor
      const mapaPacientesAgrupados = {};
      (sesionesData || []).forEach(s => {
        const pInfo = patientLookup[s.paciente_id];
        if (!pInfo) return; // Si no se encuentra mapeado, omitir

        const id_paciente = pInfo.id_paciente;
        if (!mapaPacientesAgrupados[id_paciente]) {
          mapaPacientesAgrupados[id_paciente] = {
            id_paciente: id_paciente,
            paciente_nombre: pInfo.nombre_apellido,
            dni: pInfo.dni,
            sesiones: [],
            estado: 'Pendiente', // por defecto
            obs: ''
          };
        }
        mapaPacientesAgrupados[id_paciente].sesiones.push({
          hora: s.hora,
          profesional_nombre: lookupPrestadores[s.profesional_id] || 'Sin prof.'
        });
      });

      // 4. Cargar asistencias ya guardadas para este día
      const { data: asistenciasData, error: errA } = await supabase
        .from('asistencia_pacientes_motor')
        .select('*')
        .eq('fecha', fechaTrabajo);

      if (errA) throw errA;

      // Sobrescribir estado y observaciones si ya fueron grabados
      (asistenciasData || []).forEach(a => {
        if (mapaPacientesAgrupados[a.id_paciente]) {
          mapaPacientesAgrupados[a.id_paciente].estado = a.estado;
          mapaPacientesAgrupados[a.id_paciente].obs = a.obs || '';
        }
      });

      // Ordenar por turno (Mañana primero, Tarde después) y luego alfabéticamente por nombre de paciente
      const listadoFinal = Object.values(mapaPacientesAgrupados).sort((a, b) => {
        const turnoA = getTurno(a.sesiones);
        const turnoB = getTurno(b.sesiones);
        if (turnoA !== turnoB) {
          return turnoA.localeCompare(turnoB); // "Mañana" viene antes que "Tarde"
        }
        return a.paciente_nombre.localeCompare(b.paciente_nombre);
      });

      setPacientesCargados(listadoFinal);
    } catch (err) {
      console.error("Error al cargar asistencias diarias de pacientes:", err);
      setMensaje({ texto: "Error al cargar la planilla: " + err.message, tipo: "error" });
    } finally {
      setCargando(false);
    }
  };

  const cambiarEstadoPaciente = (idPaciente, nuevoEstado) => {
    setPacientesCargados(prev =>
      prev.map(p => {
        if (p.id_paciente === idPaciente) {
          const estadoFinal = p.estado === nuevoEstado ? 'Pendiente' : nuevoEstado;
          return { ...p, estado: estadoFinal };
        }
        return p;
      })
    );
  };

  const cambiarObsPaciente = (idPaciente, nuevaObs) => {
    setPacientesCargados(prev =>
      prev.map(p => p.id_paciente === idPaciente ? { ...p, obs: nuevaObs } : p)
    );
  };

  const marcarTodosPresentes = () => {
    setPacientesCargados(prev =>
      prev.map(p => ({ ...p, estado: 'Presente' }))
    );
  };

  const guardarAsistencias = async () => {
    setGuardando(true);
    setMensaje({ texto: '', tipo: '' });
    try {
      const recordsToUpsert = pacientesCargados.map(p => ({
        fecha: fechaTrabajo,
        id_paciente: p.id_paciente,
        paciente_nombre: p.paciente_nombre,
        estado: p.estado,
        obs: p.obs,
        usuario: usuario || 'Usuario'
      }));

      if (recordsToUpsert.length === 0) {
        setMensaje({ texto: "No hay registros para guardar.", tipo: "exito" });
        setGuardando(false);
        return;
      }

      // Realizar upsert en lote
      const { error } = await supabase
        .from('asistencia_pacientes_motor')
        .upsert(recordsToUpsert, { onConflict: 'fecha,id_paciente' });

      if (error) throw error;

      setMensaje({ texto: "¡Asistencias guardadas correctamente!", tipo: "exito" });
      
      // Recargar datos para confirmar consistencia
      await cargarDatos();
    } catch (err) {
      console.error("Error al guardar asistencias:", err);
      setMensaje({ texto: "Error al guardar: " + err.message, tipo: "error" });
    } finally {
      setGuardando(false);
    }
  };

  const getUltimoDiaMes = (mesAnio) => {
    if (!mesAnio) return '';
    const [anio, mes] = mesAnio.split('-').map(Number);
    const ultimoDia = new Date(anio, mes, 0).getDate();
    return `${mesAnio}-${String(ultimoDia).padStart(2, '0')}`;
  };

  const getFechasSemanaEnMes = (mesAnio, diasSemanaEsperados) => {
    const mapDias = {
      'Domingo': 0,
      'Lunes': 1,
      'Martes': 2,
      'Miércoles': 3,
      'Jueves': 4,
      'Viernes': 5,
      'Sábado': 6
    };
    
    const indicesSemana = diasSemanaEsperados.map(d => mapDias[d]);
    const [anio, mes] = mesAnio.split('-').map(Number);
    const fechas = [];
    
    const fechaAux = new Date(anio, mes - 1, 1);
    while (fechaAux.getMonth() === mes - 1) {
      const day = fechaAux.getDay();
      if (indicesSemana.includes(day)) {
        const anioStr = fechaAux.getFullYear();
        const mesStr = String(fechaAux.getMonth() + 1).padStart(2, '0');
        const diaStr = String(fechaAux.getDate()).padStart(2, '0');
        fechas.push(`${anioStr}-${mesStr}-${diaStr}`);
      }
      fechaAux.setDate(fechaAux.getDate() + 1);
    }
    return fechas;
  };

  const generarReporteMensual = async () => {
    if (!reportePacienteId || !reporteMes) {
      setDatosReporte([]);
      setKpiReporte(null);
      return;
    }

    setCargandoReporte(true);
    try {
      const mappedPac = pacientesMap.find(p => p.id_paciente === Number(reportePacienteId));
      if (!mappedPac) {
        throw new Error("No se pudo asociar la ficha del paciente para buscar su agenda.");
      }

      const { data: sesionesPac, error: errS } = await supabase
        .from('sesiones_fijas')
        .select('*')
        .eq('paciente_id', mappedPac.id_uuid)
        .eq('estado', 'ACTIVO');

      if (errS) throw errS;

      if (!sesionesPac || sesionesPac.length === 0) {
        setDatosReporte([]);
        setKpiReporte({
          totalEsperados: 0,
          totalTranscurridos: 0,
          presentes: 0,
          conAviso: 0,
          sinAviso: 0,
          pendientes: 0,
          futuros: 0,
          porcentaje: 0
        });
        setCargandoReporte(false);
        return;
      }

      const diasSemanaPac = [...new Set(sesionesPac.map(s => s.dia_semana))];
      const sesionesPorDiaSemana = {};
      sesionesPac.forEach(s => {
        if (!sesionesPorDiaSemana[s.dia_semana]) {
          sesionesPorDiaSemana[s.dia_semana] = [];
        }
        sesionesPorDiaSemana[s.dia_semana].push({
          hora: s.hora,
          profesional: mapaPrestadores[s.profesional_id] || 'Sin prof.'
        });
      });

      const fechasEsperadas = getFechasSemanaEnMes(reporteMes, diasSemanaPac);

      const primerDia = `${reporteMes}-01`;
      const ultimoDia = getUltimoDiaMes(reporteMes);
      
      const { data: asistencias, error: errA } = await supabase
        .from('asistencia_pacientes_motor')
        .select('*')
        .eq('id_paciente', Number(reportePacienteId))
        .gte('fecha', primerDia)
        .lte('fecha', ultimoDia);

      if (errA) throw errA;

      const mapaAsistencias = {};
      (asistencias || []).forEach(a => {
        mapaAsistencias[a.fecha] = a;
      });

      // Obtener hoy en formato YYYY-MM-DD (hora local)
      const dHoy = new Date();
      const anioLocal = dHoy.getFullYear();
      const mesLocal = String(dHoy.getMonth() + 1).padStart(2, '0');
      const diaLocal = String(dHoy.getDate()).padStart(2, '0');
      const hoyStr = `${anioLocal}-${mesLocal}-${diaLocal}`;

      let countPresente = 0;
      let countConAviso = 0;
      let countSinAviso = 0;
      let countPendiente = 0; // Transcurridos y pendientes de registrar (cuentan como inasistencia)
      let totalEsperadosTranscurridos = 0;
      let countFuturos = 0;

      const listadoFechas = fechasEsperadas.map(f => {
        const diaSem = getDiaSemana(f);
        const ses = sesionesPorDiaSemana[diaSem] || [];
        const registroAsist = mapaAsistencias[f];

        let est = 'Pendiente';
        let obs = '';
        if (registroAsist) {
          est = registroAsist.estado;
          obs = registroAsist.obs || '';
        }

        const esFuturo = f > hoyStr;

        if (esFuturo) {
          countFuturos++;
        } else {
          totalEsperadosTranscurridos++;
          if (est === 'Presente') {
            countPresente++;
          } else if (est === 'Ausente con Aviso') {
            countConAviso++;
          } else if (est === 'Ausente sin Aviso') {
            countSinAviso++;
          } else {
            countPendiente++;
          }
        }

        return {
          fecha: f,
          dia_semana: diaSem,
          sesiones: ses,
          estado: est,
          obs: obs,
          esFuturo
        };
      });

      listadoFechas.sort((a, b) => a.fecha.localeCompare(b.fecha));

      // El porcentaje se calcula como: Presentes / Total Esperados Transcurridos
      const porcentaje = totalEsperadosTranscurridos > 0 
        ? (countPresente / totalEsperadosTranscurridos) * 100 
        : 0;

      setDatosReporte(listadoFechas);
      setKpiReporte({
        totalEsperados: fechasEsperadas.length,
        totalTranscurridos: totalEsperadosTranscurridos,
        presentes: countPresente,
        conAviso: countConAviso,
        sinAviso: countSinAviso,
        pendientes: countPendiente,
        futuros: countFuturos,
        porcentaje
      });

    } catch (err) {
      console.error("Error al generar reporte mensual:", err);
      alert("Error al generar el reporte: " + err.message);
    } finally {
      setCargandoReporte(false);
    }
  };

  useEffect(() => {
    generarReporteMensual();
  }, [reportePacienteId, reporteMes, pacientesMap]);

  const descargarReporteMensualExcel = () => {
    if (datosReporte.length === 0) return;
    
    const pacInfo = pacientesMotor.find(p => p.id_paciente === Number(reportePacienteId));
    const nombrePac = pacInfo ? pacInfo.nombre_apellido : 'Paciente';
    
    const BOM = "\uFEFF";
    let csv = "sep=;\n";
    csv += `Reporte Mensual de Asistencia - Paciente: ${nombrePac} (${reporteMes})\n`;
    csv += `Porcentaje de Asistencia (Hasta hoy): ${kpiReporte?.porcentaje.toFixed(1)}% | Presentes: ${kpiReporte?.presentes}/${kpiReporte?.totalTranscurridos} dias transcurridos\n\n`;
    csv += "Fecha;Día de la Semana;Horario Sesiones;Estado;Observaciones;Tipo Día\r\n";

    datosReporte.forEach(r => {
      const fecha = new Date(r.fecha + 'T00:00:00').toLocaleDateString('es-AR');
      const sesionesStr = r.sesiones.map(s => `${s.hora} - ${s.profesional}`).join(" | ");
      const tipoDia = r.esFuturo ? "Futuro" : "Transcurrido";
      const estadoFinal = r.esFuturo ? "Futuro" : r.estado;
      csv += `${fecha};${r.dia_semana};${sesionesStr};${estadoFinal};${r.obs || ''};${tipoDia}\r\n`;
    });

    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Reporte_Asistencia_${nombrePac.replace(/\s+/g, '_')}_${reporteMes}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generarReporteAlertas = async () => {
    if (!alertaMes || pacientesMap.length === 0) {
      setPacientesCriticos([]);
      return;
    }

    setCargandoAlertas(true);
    try {
      const dHoy = new Date();
      const anioLocal = dHoy.getFullYear();
      const mesLocal = String(dHoy.getMonth() + 1).padStart(2, '0');
      const diaLocal = String(dHoy.getDate()).padStart(2, '0');
      const hoyStr = `${anioLocal}-${mesLocal}-${diaLocal}`;

      const { data: sesionesFijasTodas, error: errS } = await supabase
        .from('sesiones_fijas')
        .select('*')
        .eq('estado', 'ACTIVO');

      if (errS) throw errS;

      const sesionesPorPaciente = {};
      (sesionesFijasTodas || []).forEach(s => {
        if (!sesionesPorPaciente[s.paciente_id]) {
          sesionesPorPaciente[s.paciente_id] = [];
        }
        sesionesPorPaciente[s.paciente_id].push(s);
      });

      const primerDia = `${alertaMes}-01`;
      const ultimoDia = getUltimoDiaMes(alertaMes);
      const { data: asistenciasTodas, error: errA } = await supabase
        .from('asistencia_pacientes_motor')
        .select('*')
        .gte('fecha', primerDia)
        .lte('fecha', ultimoDia);

      if (errA) throw errA;

      const asistenciasPorPaciente = {};
      (asistenciasTodas || []).forEach(a => {
        if (!asistenciasPorPaciente[a.id_paciente]) {
          asistenciasPorPaciente[a.id_paciente] = {};
        }
        asistenciasPorPaciente[a.id_paciente][a.fecha] = a.estado;
      });

      const resultadosCriticos = [];

      pacientesMap.forEach(pac => {
        const sesPac = sesionesPorPaciente[pac.id_uuid] || [];
        if (sesPac.length === 0) return;

        const diasSemanaPac = [...new Set(sesPac.map(s => s.dia_semana))];
        const fechasEsperadas = getFechasSemanaEnMes(alertaMes, diasSemanaPac);
        const fechasTranscurridas = fechasEsperadas.filter(f => f <= hoyStr);
        if (fechasTranscurridas.length === 0) return;

        let countPresente = 0;
        let countConAviso = 0;
        let countSinAviso = 0;
        let countPendiente = 0;
        const asistPac = asistenciasPorPaciente[pac.id_paciente] || {};

        fechasTranscurridas.forEach(f => {
          const est = asistPac[f] || 'Pendiente';
          if (est === 'Presente') {
            countPresente++;
          } else if (est === 'Ausente con Aviso') {
            countConAviso++;
          } else if (est === 'Ausente sin Aviso') {
            countSinAviso++;
          } else {
            countPendiente++;
          }
        });

        // porcentajeCritico = (Presente + Aviso) / Esperados. Mide la tasa de justificación/asistencia.
        const porcentajeCritico = ((countPresente + countConAviso) / fechasTranscurridas.length) * 100;
        const porcentajeReal = (countPresente / fechasTranscurridas.length) * 100;

        if (porcentajeCritico <= Number(alertaLimite)) {
          resultadosCriticos.push({
            id_paciente: pac.id_paciente,
            nombre_apellido: pac.nombre_apellido,
            dni: pac.dni,
            domicilio: pac.domicilio || 'No registrado',
            tel_padres: pac.tel_padres || 'No registrado',
            tel_alternativo: pac.tel_alternativo || 'No registrado',
            presentes: countPresente,
            conAviso: countConAviso,
            sinAviso: countSinAviso,
            pendientes: countPendiente,
            esperados: fechasTranscurridas.length,
            porcentaje: porcentajeReal,
            porcentajeCritico
          });
        }
      });

      resultadosCriticos.sort((a, b) => a.porcentajeCritico - b.porcentajeCritico);
      setPacientesCriticos(resultadosCriticos);

    } catch (err) {
      console.error("Error al generar alertas de ausentismo:", err);
      alert("Error al generar las alertas: " + err.message);
    } finally {
      setCargandoAlertas(false);
    }
  };

  useEffect(() => {
    generarReporteAlertas();
  }, [alertaMes, alertaLimite, pacientesMap]);

  const descargarReporteAlertasExcel = () => {
    if (pacientesCriticos.length === 0) return;
    
    const BOM = "\uFEFF";
    let csv = "sep=;\n";
    csv += `Reporte de Casos Críticos de Ausentismo (Corte: <= ${alertaLimite}% justificado) - Mes: ${alertaMes}\n\n`;
    csv += "Paciente;DNI;Domicilio;Contacto Padres;Contacto Alternativo;Días Presentes;Días Con Aviso;Días Sin Aviso;Días Sin Registrar;Días Esperados;Asistencia Real;Concurrencia+Aviso (Justificado)\r\n";

    pacientesCriticos.forEach(c => {
      csv += `${c.nombre_apellido};${c.dni || ''};${c.domicilio};${c.tel_padres};${c.tel_alternativo};${c.presentes};${c.conAviso};${c.sinAviso};${c.pendientes};${c.esperados};${c.porcentaje.toFixed(1)}%;${c.porcentajeCritico.toFixed(1)}%\r\n`;
    });

    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Alertas_Ausentismo_${alertaMes}_corte_${alertaLimite}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ background: '#ffffff', padding: '30px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', fontFamily: 'Segoe UI, system-ui, sans-serif', color: '#1e293b' }}>
      
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '18px', marginBottom: '25px' }}>
        <div>
          <h2 style={{ color: '#0f172a', margin: 0, fontSize: '22px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📋 Asistencia Diaria de Pacientes
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Registrá la asistencia de los pacientes basándote en la Agenda Fija diaria.</p>
        </div>
        <button
          onClick={onVolver}
          style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#475569', transition: 'background 0.2s' }}
          onMouseOver={(e) => e.target.style.background = '#e2e8f0'}
          onMouseOut={(e) => e.target.style.background = '#f1f5f9'}
        >
          ← Volver al Menú
        </button>
      </div>

      {/* Banner de Mensajes */}
      {mensaje.texto && (
        <div style={{
          padding: '12px 20px',
          borderRadius: '8px',
          marginBottom: '20px',
          fontSize: '14px',
          fontWeight: '500',
          backgroundColor: mensaje.tipo === 'exito' ? '#dcfce7' : '#fee2e2',
          color: mensaje.tipo === 'exito' ? '#15803d' : '#b91c1c',
          border: `1px solid ${mensaje.tipo === 'exito' ? '#bbf7d0' : '#fecaca'}`
        }}>
          {mensaje.texto}
        </div>
      )}

      {/* Selector de Pestañas */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: '25px', gap: '5px' }}>
        <button
          onClick={() => setActiveTab('diaria')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'diaria' ? '3px solid #3b82f6' : '3px solid transparent',
            color: activeTab === 'diaria' ? '#3b82f6' : '#64748b',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '14px',
            transition: 'all 0.2s',
            outline: 'none'
          }}
        >
          📅 Planilla Diaria
        </button>
        <button
          onClick={() => setActiveTab('reporte')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'reporte' ? '3px solid #3b82f6' : '3px solid transparent',
            color: activeTab === 'reporte' ? '#3b82f6' : '#64748b',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '14px',
            transition: 'all 0.2s',
            outline: 'none'
          }}
        >
          📊 Reporte Mensual por Paciente
        </button>
        <button
          onClick={() => setActiveTab('alertas')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'alertas' ? '3px solid #ef4444' : '3px solid transparent',
            color: activeTab === 'alertas' ? '#ef4444' : '#64748b',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '14px',
            transition: 'all 0.2s',
            outline: 'none'
          }}
        >
          🚨 Alertas de Ausentismo
        </button>
      </div>

      {activeTab === 'diaria' && (
        <>
          {/* Filtros / Selector de fecha */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center', marginBottom: '25px', background: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Fecha de Trabajo</label>
              <input
                type="date"
                value={fechaTrabajo}
                onChange={(e) => setFechaTrabajo(e.target.value)}
                style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', background: '#fff', fontWeight: '600', color: '#0f172a' }}
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Día Seleccionado</span>
              <span style={{ padding: '8px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>
                📅 {diaSemanaNombre}
              </span>
            </div>

            {pacientesCargados.length > 0 && (
              <button
                onClick={marcarTodosPresentes}
                style={{ marginLeft: 'auto', background: '#10b981', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.2s' }}
                onMouseOver={(e) => e.currentTarget.style.background = '#059669'}
                onMouseOut={(e) => e.currentTarget.style.background = '#10b981'}
              >
                ✅ Marcar todos como Presentes
              </button>
            )}
          </div>

          {/* Contenido / Grilla */}
          {cargando ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '50px' }}>
              <div style={{ width: '40px', height: '40px', border: '4px solid #f3f4f6', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              <p style={{ marginTop: '15px', color: '#64748b', fontSize: '14px', fontWeight: '500' }}>Cargando agenda del día...</p>
            </div>
          ) : (
            <>
              {pacientesCargados.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', border: '2px dashed #cbd5e1', borderRadius: '12px', background: '#f8fafc' }}>
                  <span style={{ fontSize: '32px', display: 'block', marginBottom: '10px' }}>🏖️</span>
                  <h4 style={{ margin: 0, color: '#475569', fontSize: '15px', fontWeight: 'bold' }}>
                    No hay sesiones programadas en la agenda fija para los {diaSemanaNombre}s.
                  </h4>
                  <p style={{ margin: '5px 0 0 0', color: '#94a3b8', fontSize: '12px' }}>
                    Seleccioná otra fecha o agregá sesiones fijas a los pacientes en este día.
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px', marginBottom: '25px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 'bold' }}>
                        <th style={{ padding: '14px 20px' }}>Paciente</th>
                        <th style={{ padding: '14px 20px' }}>Sesiones Fijas del Día</th>
                        <th style={{ padding: '14px 20px', width: '280px', textAlign: 'center' }}>Estado de Asistencia</th>
                        <th style={{ padding: '14px 20px' }}>Observaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pacientesCargados.map((p, idx) => (
                        <tr key={p.id_paciente} style={{ borderBottom: '1px solid #edf2f7', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                          <td style={{ padding: '14px 20px', fontWeight: 'bold', color: '#0f172a' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span>{p.paciente_nombre}</span>
                              <span style={{ 
                                display: 'inline-block', 
                                fontSize: '10px', 
                                fontWeight: 'bold', 
                                color: getTurno(p.sesiones) === 'Mañana' ? '#0369a1' : '#b45309', 
                                background: getTurno(p.sesiones) === 'Mañana' ? '#e0f2fe' : '#fef3c7', 
                                padding: '2px 6px', 
                                borderRadius: '4px' 
                              }}>
                                {getTurno(p.sesiones) === 'Mañana' ? '☀️ Mañana' : '⛅ Tarde'}
                              </span>
                            </div>
                            {p.dni && <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8', fontWeight: '500', marginTop: '2px' }}>DNI: {p.dni}</span>}
                          </td>
                          <td style={{ padding: '14px 20px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {p.sesiones.map((s, sIdx) => (
                                <span key={sIdx} style={{ fontSize: '11px', background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '3px 8px', borderRadius: '20px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  🕒 <strong>{s.hora}</strong> - {s.profesional_nombre}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '4px', borderRadius: '8px', border: '1px solid #e2e8f0', gap: '4px' }}>
                              <button
                                onClick={() => cambiarEstadoPaciente(p.id_paciente, 'Presente')}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: 'bold',
                                  transition: 'all 0.15s',
                                  background: p.estado === 'Presente' ? '#10b981' : 'transparent',
                                  color: p.estado === 'Presente' ? '#fff' : '#64748b'
                                }}
                              >
                                Presente
                              </button>
                              <button
                                onClick={() => cambiarEstadoPaciente(p.id_paciente, 'Ausente con Aviso')}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: 'bold',
                                  transition: 'all 0.15s',
                                  background: p.estado === 'Ausente con Aviso' ? '#f59e0b' : 'transparent',
                                  color: p.estado === 'Ausente con Aviso' ? '#fff' : '#64748b'
                                }}
                              >
                                C/Aviso
                              </button>
                              <button
                                onClick={() => cambiarEstadoPaciente(p.id_paciente, 'Ausente sin Aviso')}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: 'bold',
                                  transition: 'all 0.15s',
                                  background: p.estado === 'Ausente sin Aviso' ? '#ef4444' : 'transparent',
                                  color: p.estado === 'Ausente sin Aviso' ? '#fff' : '#64748b'
                                }}
                              >
                                S/Aviso
                              </button>
                            </div>
                          </td>
                          <td style={{ padding: '14px 20px' }}>
                            <input
                              type="text"
                              value={p.obs}
                              onChange={(e) => cambiarObsPaciente(p.id_paciente, e.target.value)}
                              placeholder="Nota (Ej: Faltó por fiebre)..."
                              style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {pacientesCargados.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                  <button
                    onClick={guardarAsistencias}
                    disabled={guardando}
                    style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.2s', boxShadow: '0 4px 6px rgba(59, 130, 246, 0.2)' }}
                    onMouseOver={(e) => e.currentTarget.style.background = '#2563eb'}
                    onMouseOut={(e) => e.currentTarget.style.background = '#3b82f6'}
                  >
                    💾 {guardando ? 'Guardando...' : 'Guardar Planilla de Asistencias'}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {activeTab === 'reporte' && (
        <>
          {/* Filtros del Reporte */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center', marginBottom: '25px', background: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1', minWidth: '220px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Seleccionar Paciente *</label>
              <select
                value={reportePacienteId}
                onChange={(e) => setReportePacienteId(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', background: '#fff', fontWeight: '600', color: '#0f172a' }}
              >
                <option value="">-- Seleccionar Paciente --</option>
                {pacientesMotor.map(p => (
                  <option key={p.id_paciente} value={p.id_paciente}>
                    {p.nombre_apellido} {p.dni ? `(DNI: ${p.dni})` : ''}
                  </option>
                ))}
              </select>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '180px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Mes / Año *</label>
              <input
                type="month"
                value={reporteMes}
                onChange={(e) => setReporteMes(e.target.value)}
                style={{ padding: '7px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', background: '#fff', fontWeight: '600', color: '#0f172a' }}
              />
            </div>

            {datosReporte.length > 0 && (
              <button
                onClick={descargarReporteMensualExcel}
                style={{ marginLeft: 'auto', background: '#10b981', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.2s' }}
                onMouseOver={(e) => e.currentTarget.style.background = '#059669'}
                onMouseOut={(e) => e.currentTarget.style.background = '#10b981'}
              >
                📥 Descargar Excel
              </button>
            )}
          </div>

          {/* Grilla / Resultados del Reporte */}
          {cargandoReporte ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '50px' }}>
              <div style={{ width: '40px', height: '40px', border: '4px solid #f3f4f6', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              <p style={{ marginTop: '15px', color: '#64748b', fontSize: '14px', fontWeight: '500' }}>Generando reporte...</p>
            </div>
          ) : (
            <>
              {!reportePacienteId ? (
                <div style={{ padding: '40px', textAlign: 'center', border: '2px dashed #cbd5e1', borderRadius: '12px', background: '#f8fafc' }}>
                  <span style={{ fontSize: '32px', display: 'block', marginBottom: '10px' }}>🔍</span>
                  <h4 style={{ margin: 0, color: '#475569', fontSize: '15px', fontWeight: 'bold' }}>
                    Seleccioná un paciente y un mes para auditar la asistencia.
                  </h4>
                </div>
              ) : datosReporte.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', border: '2px dashed #cbd5e1', borderRadius: '12px', background: '#f8fafc' }}>
                  <span style={{ fontSize: '32px', display: 'block', marginBottom: '10px' }}>🏖️</span>
                  <h4 style={{ margin: 0, color: '#475569', fontSize: '15px', fontWeight: 'bold' }}>
                    Este paciente no tiene sesiones programadas en su Agenda Fija para los días de este mes.
                  </h4>
                </div>
              ) : (
                <>
                  {/* Bloque KPI */}
                  {kpiReporte && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '25px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '15px' }}>
                        <div style={{ padding: '15px', borderRadius: '12px', background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', border: '1px solid #bfdbfe', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#1e40af', textTransform: 'uppercase' }}>Porcentaje Asistencia</span>
                          <span style={{ fontSize: '24px', fontWeight: '800', color: '#2563eb', marginTop: '4px' }}>{kpiReporte.porcentaje.toFixed(1)}%</span>
                        </div>
                        <div style={{ padding: '15px', borderRadius: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#166534', textTransform: 'uppercase' }}>Presentes</span>
                          <span style={{ fontSize: '24px', fontWeight: '800', color: '#16a34a', marginTop: '4px' }}>{kpiReporte.presentes} d</span>
                        </div>
                        <div style={{ padding: '15px', borderRadius: '12px', background: '#fef3c7', border: '1px solid #fde68a', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#92400e', textTransform: 'uppercase' }}>Ausentes c/Aviso</span>
                          <span style={{ fontSize: '24px', fontWeight: '800', color: '#d97706', marginTop: '4px' }}>{kpiReporte.conAviso} d</span>
                        </div>
                        <div style={{ padding: '15px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#991b1b', textTransform: 'uppercase' }}>Ausentes s/Aviso</span>
                          <span style={{ fontSize: '24px', fontWeight: '800', color: '#dc2626', marginTop: '4px' }}>{kpiReporte.sinAviso} d</span>
                        </div>
                        <div style={{ padding: '15px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Sin Registrar (Inasistencia)</span>
                          <span style={{ fontSize: '24px', fontWeight: '800', color: '#64748b', marginTop: '4px' }}>{kpiReporte.pendientes} d</span>
                        </div>
                        <div style={{ padding: '15px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Días Transcurridos</span>
                          <span style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', marginTop: '4px' }}>{kpiReporte.totalTranscurridos} d</span>
                        </div>
                      </div>
                      
                      <div style={{ fontSize: '12px', color: '#64748b', background: '#f8fafc', padding: '10px 15px', borderRadius: '8px', border: '1px solid #e2e8f0', fontWeight: '500' }}>
                        ℹ️ <strong>Nota de KPI:</strong> El porcentaje de asistencia <strong>({kpiReporte.porcentaje.toFixed(1)}%)</strong> se calcula sobre los días transcurridos hasta hoy ({kpiReporte.totalTranscurridos} de {kpiReporte.totalEsperados} días programados en el mes). Los días con registro <strong>Pendiente</strong> que ya han transcurrido computan automáticamente como inasistencia.
                      </div>
                    </div>
                  )}

                  {/* Tabla del Reporte */}
                  <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px', marginBottom: '20px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 'bold' }}>
                          <th style={{ padding: '14px 20px' }}>Fecha</th>
                          <th style={{ padding: '14px 20px' }}>Día de la Semana</th>
                          <th style={{ padding: '14px 20px' }}>Sesiones Fijas del Día</th>
                          <th style={{ padding: '14px 20px', width: '180px', textAlign: 'center' }}>Estado</th>
                          <th style={{ padding: '14px 20px' }}>Observaciones Registradas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datosReporte.map((r, idx) => {
                          const dateObj = new Date(r.fecha + 'T00:00:00');
                          const dateStr = dateObj.toLocaleDateString('es-AR');
                          return (
                            <tr key={r.fecha} style={{ borderBottom: '1px solid #edf2f7', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc', opacity: r.esFuturo ? 0.6 : 1 }}>
                              <td style={{ padding: '14px 20px', fontWeight: 'bold', color: '#0f172a' }}>
                                {dateStr}
                              </td>
                              <td style={{ padding: '14px 20px', fontWeight: '600', color: '#475569' }}>
                                {r.dia_semana}
                              </td>
                              <td style={{ padding: '14px 20px' }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                  {r.sesiones.map((s, sIdx) => (
                                    <span key={sIdx} style={{ fontSize: '11px', background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '3px 8px', borderRadius: '20px' }}>
                                      🕒 {s.hora} - {s.profesional}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '4px 12px',
                                  borderRadius: '20px',
                                  fontSize: '12px',
                                  fontWeight: 'bold',
                                  color: '#fff',
                                  backgroundColor: r.esFuturo ? '#cbd5e1' :
                                                   r.estado === 'Presente' ? '#10b981' :
                                                   r.estado === 'Ausente con Aviso' ? '#f59e0b' :
                                                   r.estado === 'Ausente sin Aviso' ? '#ef4444' : '#64748b'
                                }}>
                                  {r.estado}
                                </span>
                              </td>
                              <td style={{ padding: '14px 20px', color: '#64748b', fontStyle: r.obs ? 'normal' : 'italic' }}>
                                {r.obs || 'Sin observaciones'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {activeTab === 'alertas' && (
        <>
          {/* Filtros del Reporte de Alertas */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center', marginBottom: '25px', background: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '180px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Mes / Año *</label>
              <input
                type="month"
                value={alertaMes}
                onChange={(e) => setAlertaMes(e.target.value)}
                style={{ padding: '7px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', background: '#fff', fontWeight: '600', color: '#0f172a' }}
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '180px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Límite de Alerta (%) *</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={alertaLimite}
                  onChange={(e) => setAlertaLimite(Math.min(100, Math.max(0, Number(e.target.value))))}
                  style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', background: '#fff', fontWeight: '600', color: '#0f172a', width: '80px' }}
                />
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#475569' }}>% o menos</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', background: '#fee2e2', border: '1px solid #fecaca', padding: '8px 15px', borderRadius: '8px', gap: '8px', fontSize: '12px', color: '#991b1b', fontWeight: '500', maxWidth: '380px' }}>
              <span>⚠️</span>
              <span><strong>Criterio de Alerta:</strong> Pacientes con asistencia justificada (Presente + Con Aviso) menor o igual al {alertaLimite}%. Las faltas sin aviso o sin registrar incrementan la criticidad.</span>
            </div>

            {pacientesCriticos.length > 0 && (
              <button
                onClick={descargarReporteAlertasExcel}
                style={{ marginLeft: 'auto', background: '#10b981', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.2s' }}
                onMouseOver={(e) => e.currentTarget.style.background = '#059669'}
                onMouseOut={(e) => e.currentTarget.style.background = '#10b981'}
              >
                📥 Descargar Casos Críticos
              </button>
            )}
          </div>

          {/* Grilla / Resultados de Alertas */}
          {cargandoAlertas ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '50px' }}>
              <div style={{ width: '40px', height: '40px', border: '4px solid #f3f4f6', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              <p style={{ marginTop: '15px', color: '#64748b', fontSize: '14px', fontWeight: '500' }}>Calculando ausentismos...</p>
            </div>
          ) : (
            <>
              {pacientesCriticos.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', border: '2px dashed #cbd5e1', borderRadius: '12px', background: '#f8fafc' }}>
                  <span style={{ fontSize: '32px', display: 'block', marginBottom: '10px' }}>🎉</span>
                  <h4 style={{ margin: 0, color: '#16a34a', fontSize: '15px', fontWeight: 'bold' }}>
                    ¡Excelente! Ningún paciente se encuentra por debajo del {alertaLimite}% de asistencia justificada en este mes.
                  </h4>
                  <p style={{ margin: '5px 0 0 0', color: '#64748b', fontSize: '12px' }}>
                    Todos los pacientes están avisando o asistiendo adecuadamente.
                  </p>
                </div>
              ) : (
                <>
                  <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: '12px 20px', borderRadius: '8px', color: '#b45309', fontSize: '13px', fontWeight: '600', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🚨 Se identificaron <strong>{pacientesCriticos.length} casos críticos</strong> con un porcentaje de justificación/contacto menor o igual al {alertaLimite}%.
                  </div>

                  <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 'bold' }}>
                          <th style={{ padding: '14px 20px' }}>Paciente</th>
                          <th style={{ padding: '14px 20px', width: '140px', textAlign: 'center' }}>% Justificado *</th>
                          <th style={{ padding: '14px 20px', width: '140px', textAlign: 'center' }}>% Asist. Real</th>
                          <th style={{ padding: '14px 20px' }}>Detalle de Días (Transcurridos)</th>
                          <th style={{ padding: '14px 20px' }}>Domicilio</th>
                          <th style={{ padding: '14px 20px' }}>Contactos de Emergencia / Padres</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pacientesCriticos.map((c, idx) => (
                          <tr key={c.id_paciente} style={{ borderBottom: '1px solid #edf2f7', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                            <td style={{ padding: '14px 20px', fontWeight: 'bold', color: '#0f172a' }}>
                              {c.nombre_apellido}
                              {c.dni && <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8', fontWeight: '500', marginTop: '2px' }}>DNI: {c.dni}</span>}
                            </td>
                            <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-block',
                                padding: '6px 14px',
                                borderRadius: '20px',
                                fontSize: '13px',
                                fontWeight: '800',
                                color: '#fff',
                                backgroundColor: c.porcentajeCritico <= 40 ? '#ef4444' : '#f59e0b'
                              }}>
                                {c.porcentajeCritico.toFixed(1)}%
                              </span>
                            </td>
                            <td style={{ padding: '14px 20px', textAlign: 'center', fontWeight: 'bold', color: '#475569' }}>
                              {c.porcentaje.toFixed(1)}%
                            </td>
                            <td style={{ padding: '14px 20px', color: '#475569', fontSize: '13px' }}>
                              <div>🟢 <strong>{c.presentes}</strong> Pres. | 🟡 <strong>{c.conAviso}</strong> C/Aviso</div>
                              <div style={{ color: '#b91c1c', marginTop: '3px' }}>🔴 <strong>{c.sinAviso + c.pendientes}</strong> Sin Aviso/Pendientes</div>
                              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Total transcurridos: {c.esperados} d</div>
                            </td>
                            <td style={{ padding: '14px 20px', color: '#334155' }}>
                              📍 {c.domicilio}
                            </td>
                            <td style={{ padding: '14px 20px', fontSize: '13px', color: '#1e293b' }}>
                              📞 {c.tel_padres} 
                              {c.tel_alternativo && c.tel_alternativo !== 'No registrado' && ` / 📱 ${c.tel_alternativo}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* Soporte CSS animación spinner */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
