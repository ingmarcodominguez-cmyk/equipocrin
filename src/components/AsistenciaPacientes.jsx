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

  const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  const getDiaSemana = (fechaStr) => {
    if (!fechaStr) return '';
    const d = new Date(fechaStr + 'T00:00:00');
    return diasSemana[d.getDay()];
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
      const { data: pList, error: errP } = await supabase.from('pacientes').select('id, nombre, id_paciente_excel');
      const { data: pmList, error: errPM } = await supabase.from('pacientes_motor').select('id_paciente, nombre_apellido, dni');

      if (errP) throw errP;
      if (errPM) throw errPM;

      setPacientesMotor(pmList || []);

      // Construir mapa de UUID -> INT paciente
      const listadoMapeado = [];
      const patientLookup = {};
      (pList || []).forEach(p => {
        let match = (pmList || []).find(pm => pm.id_paciente === p.id_paciente_excel);
        if (!match && p.nombre) {
          const cleanName = p.nombre.trim().toLowerCase();
          match = (pmList || []).find(pm => pm.nombre_apellido?.trim().toLowerCase() === cleanName);
        }
        if (match) {
          patientLookup[p.id] = {
            id_paciente: match.id_paciente,
            nombre_apellido: match.nombre_apellido,
            dni: match.dni
          };
          listadoMapeado.push({
            id_uuid: p.id,
            id_paciente: match.id_paciente,
            nombre_apellido: match.nombre_apellido,
            dni: match.dni
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

      // Ordenar alfabéticamente por nombre de paciente
      const listadoFinal = Object.values(mapaPacientesAgrupados).sort((a, b) =>
        a.paciente_nombre.localeCompare(b.paciente_nombre)
      );

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
          presentes: 0,
          conAviso: 0,
          sinAviso: 0,
          pendientes: 0,
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
      const ultimoDia = `${reporteMes}-31`;
      
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

      let countPresente = 0;
      let countConAviso = 0;
      let countSinAviso = 0;
      let countPendiente = 0;

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

        if (est === 'Presente') countPresente++;
        else if (est === 'Ausente con Aviso') countConAviso++;
        else if (est === 'Ausente sin Aviso') countSinAviso++;
        else countPendiente++;

        return {
          fecha: f,
          dia_semana: diaSem,
          sesiones: ses,
          estado: est,
          obs: obs
        };
      });

      listadoFechas.sort((a, b) => a.fecha.localeCompare(b.fecha));

      const totalRegistrados = countPresente + countConAviso + countSinAviso;
      const porcentaje = totalRegistrados > 0 ? (countPresente / totalRegistrados) * 100 : 0;

      setDatosReporte(listadoFechas);
      setKpiReporte({
        totalEsperados: fechasEsperadas.length,
        presentes: countPresente,
        conAviso: countConAviso,
        sinAviso: countSinAviso,
        pendientes: countPendiente,
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
    csv += `Porcentaje de Asistencia: ${kpiReporte?.porcentaje.toFixed(1)}% | Asistencias: ${kpiReporte?.presentes}/${kpiReporte?.totalEsperados - kpiReporte?.pendientes} registrados\n\n`;
    csv += "Fecha;Día de la Semana;Horario Sesiones;Estado;Observaciones\r\n";

    datosReporte.forEach(r => {
      const fecha = new Date(r.fecha + 'T00:00:00').toLocaleDateString('es-AR');
      const sesionesStr = r.sesiones.map(s => `${s.hora} - ${s.profesional}`).join(" | ");
      csv += `${fecha};${r.dia_semana};${sesionesStr};${r.estado};${r.obs || ''}\r\n`;
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
                            {p.paciente_nombre}
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '15px', marginBottom: '25px' }}>
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
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Sin Registrar</span>
                        <span style={{ fontSize: '24px', fontWeight: '800', color: '#64748b', marginTop: '4px' }}>{kpiReporte.pendientes} d</span>
                      </div>
                      <div style={{ padding: '15px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>Total Esperados</span>
                        <span style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', marginTop: '4px' }}>{kpiReporte.totalEsperados} d</span>
                      </div>
                    </div>
                  )}

                  {/* Tabla del Reporte */}
                  <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
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
                            <tr key={r.fecha} style={{ borderBottom: '1px solid #edf2f7', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
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
                                  backgroundColor: r.estado === 'Presente' ? '#10b981' :
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
