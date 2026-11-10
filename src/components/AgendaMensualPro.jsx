import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'

function AgendaMensualPro({ userData }) {
  const [turnos, setTurnos] = useState([])
  const [users, setUsers] = useState([])
  const [pacientesBD, setPacientesBD] = useState([])
  const [mesActual, setMesActual] = useState(new Date())
  const [diaSeleccionado, setDiaSeleccionado] = useState(null)
  const [turnoEditando, setTurnoEditando] = useState(null)
  
  const [filtroFecha, setFiltroFecha] = useState(null)
  const [filtroFechaInput, setFiltroFechaInput] = useState('') 
  const [filtroProfesional, setFiltroProfesional] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroPaciente, setFiltroPaciente] = useState('')
  const [verSoloFuturos, setVerSoloFuturos] = useState(true)
  
  const [form, setForm] = useState({ 
    paciente_nombre: '', profesional_id: '', prestacion: 'Turno primera vez', 
    hora: '09:00', observaciones: '', estado: 'pendiente', horario_especial: '' 
  })

  // Estados para Carga Masiva (Turnos recurrentes fijos)
  const [modalMasivoAbierto, setModalMasivoAbierto] = useState(false)
  const [guardandoMasivo, setGuardandoMasivo] = useState(false)
  const [fechasExcluidas, setFechasExcluidas] = useState([])
  const [formMasivo, setFormMasivo] = useState({
    paciente_nombre: '',
    profesional_id: '',
    prestacion: 'Tratamiento',
    hora: '09:00',
    horario_especial: '',
    estado: 'pendiente',
    observaciones: '',
    mes: new Date().getMonth(),
    ano: new Date().getFullYear(),
    diasSemana: [1] // Lunes por defecto
  })

  // Estados para Consulta de Horarios Disponibles (Libres)
  const [modalDisponiblesAbierto, setModalDisponiblesAbierto] = useState(false)
  const [dispMes, setDispMes] = useState(new Date().getMonth())
  const [dispAno, setDispAno] = useState(new Date().getFullYear())
  const [dispProfesionalesIds, setDispProfesionalesIds] = useState([])
  const [dispModoDias, setDispModoDias] = useState('semana') // 'semana' | 'fechas'
  const [dispDiasSemana, setDispDiasSemana] = useState([1, 2, 3, 4, 5])
  const [dispFechasExactas, setDispFechasExactas] = useState([])
  const [dispFranja, setDispFranja] = useState('todas') // 'todas' | 'manana' | 'tarde'
  const [dispSoloFuturos, setDispSoloFuturos] = useState(true)
  const [dispMostrarOcupados, setDispMostrarOcupados] = useState(false)
  const [dispCopiado, setDispCopiado] = useState(false)

  const diasSemanaOpciones = [
    { id: 1, label: 'Lunes', corto: 'Lun' },
    { id: 2, label: 'Martes', corto: 'Mar' },
    { id: 3, label: 'Miércoles', corto: 'Mié' },
    { id: 4, label: 'Jueves', corto: 'Jue' },
    { id: 5, label: 'Viernes', corto: 'Vie' },
    { id: 6, label: 'Sábado', corto: 'Sáb' },
    { id: 0, label: 'Domingo', corto: 'Dom' }
  ]

  const mesesNombres = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ]

  const rol = userData?.rol?.toUpperCase() || "";
  const esAdmin = ['ADMINISTRACION', 'DIRECCION', 'PROFESIONAL_PLUS'].includes(rol);

  const esMarinaOlivera = (id, nombre) => {
    const idStr = String(id || '').trim();
    if (idStr === '692dc3c6-7a77-4862-bee3-28e700aac08b' || idStr === 'e12e12e1-1212-1212-1212-121212121212') return true;
    const n = (nombre || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return n.includes('MARINA') && n.includes('OLIVERA');
  };

  const getMarinaIds = () => {
    const ids = ['692dc3c6-7a77-4862-bee3-28e700aac08b', 'e12e12e1-1212-1212-1212-121212121212'];
    (users || []).forEach(u => {
      if (esMarinaOlivera(u.id, u.nombre) && !ids.includes(String(u.id))) {
        ids.push(String(u.id));
      }
    });
    return ids;
  };

  useEffect(() => {
    if (!esAdmin && userData?.id) {
      setFiltroProfesional(String(userData.id));
      setForm(prev => ({ ...prev, profesional_id: String(userData.id) }));
    }
  }, [userData?.id, esAdmin]);

  const generarHorarios = () => {
    const arr = [];
    let horaMa = 9, minMa = 0;
    while (horaMa < 13 || (horaMa === 12 && minMa <= 45)) {
      if (horaMa === 13) break;
      arr.push(`${String(horaMa).padStart(2, '0')}:${String(minMa).padStart(2, '0')}`);
      minMa += 45;
      if (minMa >= 60) { horaMa += 1; minMa -= 60; }
    }
    let horaTa = 14, minTa = 0;
    while (horaTa < 21) {
      arr.push(`${String(horaTa).padStart(2, '0')}:${String(minTa).padStart(2, '0')}`);
      minTa += 45;
      if (minTa >= 60) { horaTa += 1; minTa -= 60; }
    }
    return arr;
  };

  const listaHorarios = generarHorarios();

  useEffect(() => {
    cargarDatos();
    const channel = supabase
      .channel('agenda_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turnos' }, () => {
        cargarDatos();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [mesActual]);

  async function cargarDatos() {
    const { data: t } = await supabase.from('turnos').select('*');
    const { data: u } = await supabase.from('users').select('*').order('nombre', { ascending: true });
    const { data: p } = await supabase.from('pacientes_motor').select('nombre_apellido').order('nombre_apellido', { ascending: true });
    if (t) setTurnos(t);
    if (u) setUsers(u);
    if (p) setPacientesBD(p.map(x => x.nombre_apellido).filter(Boolean));
  }

  async function guardarTurno() {
    const horaSeleccionada = form.horario_especial || form.hora;
    const fechaSeleccionada = `${mesActual.getFullYear()}-${String(mesActual.getMonth() + 1).padStart(2, '0')}-${String(diaSeleccionado).padStart(2, '0')}`;
    
    const marinaIds = getMarinaIds();
    const existeConflicto = turnos.some(t => {
      const esElMismoTurno = turnoEditando ? String(t.id) === String(turnoEditando.id) : false;
      if (esElMismoTurno) return false;
      const tFecha = new Date(t.fecha_inicio).toISOString().split('T')[0];
      const tHora = t.observaciones?.split(']')[0]?.replace('[', '');
      const tProfId = String(t.profesional_id || '').trim();
      const formProfId = String(form.profesional_id || '').trim();
      const mismoProf = tProfId === formProfId || 
        (marinaIds.includes(tProfId) && marinaIds.includes(formProfId));
      return mismoProf && 
             tFecha === fechaSeleccionada && 
             tHora === horaSeleccionada;
    });

    if (existeConflicto) {
      alert("¡Cuidado! El profesional ya tiene OTRO turno asignado en ese horario.");
      return; 
    }

    const fechaISO = `${fechaSeleccionada}T${horaSeleccionada}:00`;
    const profesionalObj = users.find(u => String(u.id) === String(form.profesional_id));
    const nombreProf = profesionalObj ? profesionalObj.nombre : 'Sin Prof.';
    
    // Limpiar posibles cabeceras previas para no acumular tags repetidos
    const notasLibres = (form.observaciones || '')
      .replace(/^(\[\s*[^\]]+\]\s*)+/, '')
      .trim();
    const obsEmpaquetadas = notasLibres
      ? `[${horaSeleccionada}] [${form.prestacion}] [${nombreProf}] ${notasLibres}`
      : `[${horaSeleccionada}] [${form.prestacion}] [${nombreProf}]`;

    const payload = { 
      paciente_nombre: form.paciente_nombre, 
      profesional_id: form.profesional_id, 
      fecha_inicio: fechaISO, 
      observaciones: obsEmpaquetadas, 
      estado: form.estado 
    };

    if (turnoEditando) {
      await supabase.from('turnos').update(payload).eq('id', turnoEditando.id);
    } else {
      await supabase.from('turnos').insert([payload]);
    }
    await cargarDatos();
    setDiaSeleccionado(null); 
    setTurnoEditando(null);
  }

  async function eliminarTurno() {
    if (!turnoEditando) return;
    if (window.confirm("¿Estás seguro de que quieres eliminar este turno definitivamente?")) {
      await supabase.from('turnos').delete().eq('id', turnoEditando.id);
      await cargarDatos();
      setDiaSeleccionado(null);
      setTurnoEditando(null);
    }
  }

  const limpiarFiltroFecha = () => {
    setFiltroFecha(null);
    setFiltroFechaInput('');
  };

  const marinaIds = getMarinaIds();
  const usuarioEsMarina = esMarinaOlivera(userData?.id, userData?.nombre);
  const filtroEsMarina = marinaIds.includes(String(filtroProfesional || '').trim());

  let turnosVisibles = esAdmin 
    ? turnos 
    : turnos.filter(t => {
        const tProfId = String(t.profesional_id || '').trim();
        if (usuarioEsMarina) {
          return marinaIds.includes(tProfId);
        }
        return tProfId === String(userData?.id || '').trim();
      });

  if (filtroProfesional) {
    if (filtroEsMarina) {
      turnosVisibles = turnosVisibles.filter(t => marinaIds.includes(String(t.profesional_id || '').trim()));
    } else {
      turnosVisibles = turnosVisibles.filter(t => String(t.profesional_id) === String(filtroProfesional));
    }
  }
  if (filtroEstado) turnosVisibles = turnosVisibles.filter(t => t.estado === filtroEstado);
  if (filtroPaciente) {
    turnosVisibles = turnosVisibles.filter(t => 
      t.paciente_nombre && t.paciente_nombre.toLowerCase().includes(filtroPaciente.toLowerCase())
    );
  }

  const prestaciones = ['Turno primera vez', 'Evaluacion', 'Reunion', 'Entrenamiento', 'Devolucion','Visita A Instituciones','Tratamiento'];
  const diasEnMes = new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 0).getDate();
  const offset = (new Date(mesActual.getFullYear(), mesActual.getMonth(), 1).getDay() + 6) % 7;

  // Calculo de turnos completos del paciente buscado (independientemente del mes en pantalla)
  const hoyInicioDia = new Date();
  hoyInicioDia.setHours(0, 0, 0, 0);

  const turnosPacienteFiltrado = filtroPaciente.trim() 
    ? turnosVisibles.filter(t => {
        if (verSoloFuturos) {
          return new Date(t.fecha_inicio) >= hoyInicioDia;
        }
        return true;
      }).sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio))
    : [];

  const pacientesUnicos = useMemo(() => {
    const set = new Set();
    (turnos || []).forEach(t => { if (t.paciente_nombre) set.add(t.paciente_nombre.trim()); });
    (pacientesBD || []).forEach(nom => { if (nom) set.add(nom.trim()); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [turnos, pacientesBD]);

  const sugerenciasPacientes = filtroPaciente.trim()
    ? pacientesUnicos.filter(n => n.toLowerCase().includes(filtroPaciente.toLowerCase().trim()))
    : [];

  const abrirModalMasivoConDatos = (datosIniciales = {}) => {
    const mesDefecto = datosIniciales.mes !== undefined ? datosIniciales.mes : mesActual.getMonth();
    const anoDefecto = datosIniciales.ano !== undefined ? datosIniciales.ano : mesActual.getFullYear();
    const profDefecto = datosIniciales.profesional_id || filtroProfesional || (!esAdmin && userData?.id ? String(userData.id) : '');

    setFormMasivo({
      paciente_nombre: datosIniciales.paciente_nombre || filtroPaciente || '',
      prestacion: datosIniciales.prestacion || 'Tratamiento',
      profesional_id: profDefecto,
      mes: mesDefecto,
      ano: anoDefecto,
      diasSemana: datosIniciales.diasSemana && datosIniciales.diasSemana.length > 0 ? datosIniciales.diasSemana : [1],
      hora: datosIniciales.hora || '09:00',
      horario_especial: datosIniciales.horario_especial || '',
      estado: datosIniciales.estado || 'pendiente',
      observaciones: datosIniciales.observaciones || ''
    });
    setFechasExcluidas([]);
    setModalMasivoAbierto(true);
  };

  const toggleDiaSemana = (diaId) => {
    setFormMasivo(prev => {
      const yaEsta = prev.diasSemana.includes(diaId);
      if (yaEsta) {
        if (prev.diasSemana.length === 1) return prev;
        return { ...prev, diasSemana: prev.diasSemana.filter(d => d !== diaId) };
      } else {
        return { ...prev, diasSemana: [...prev.diasSemana, diaId].sort() };
      }
    });
  };

  const toggleFechaExcluida = (fechaStr) => {
    setFechasExcluidas(prev => {
      if (prev.includes(fechaStr)) {
        return prev.filter(f => f !== fechaStr);
      } else {
        return [...prev, fechaStr];
      }
    });
  };

  const fechasCalculadasMasivo = useMemo(() => {
    if (!formMasivo.diasSemana || formMasivo.diasSemana.length === 0) return [];
    const totalDias = new Date(formMasivo.ano, formMasivo.mes + 1, 0).getDate();
    const resultado = [];
    const horaSel = formMasivo.horario_especial || formMasivo.hora;

    for (let d = 1; d <= totalDias; d++) {
      const fechaUtc = new Date(Date.UTC(formMasivo.ano, formMasivo.mes, d, 12, 0, 0));
      const diaSemana = fechaUtc.getUTCDay();

      if (formMasivo.diasSemana.includes(diaSemana)) {
        const diaNombre = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][diaSemana];
        const fechaStr = `${formMasivo.ano}-${String(formMasivo.mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

        let tieneConflicto = false;
        let pacienteConflicto = '';
        if (formMasivo.profesional_id) {
          const profId = String(formMasivo.profesional_id).trim();
          const conflicto = (turnos || []).find(t => {
            const tFecha = new Date(t.fecha_inicio).toISOString().split('T')[0];
            const tHora = t.observaciones?.split(']')[0]?.replace('[', '').trim();
            const tProfId = String(t.profesional_id || '').trim();
            const mismoProf = tProfId === profId || (marinaIds.includes(tProfId) && marinaIds.includes(profId));
            return mismoProf && tFecha === fechaStr && tHora === horaSel;
          });
          if (conflicto) {
            tieneConflicto = true;
            pacienteConflicto = conflicto.paciente_nombre || 'Otro paciente';
          }
        }

        resultado.push({
          diaNumero: d,
          diaNombre,
          fechaStr,
          fechaISO: `${fechaStr}T${horaSel}:00`,
          tieneConflicto,
          pacienteConflicto
        });
      }
    }
    return resultado;
  }, [formMasivo.ano, formMasivo.mes, formMasivo.diasSemana, formMasivo.hora, formMasivo.horario_especial, formMasivo.profesional_id, turnos, marinaIds]);

  async function ejecutarCargaMasiva() {
    if (!formMasivo.paciente_nombre.trim()) {
      alert("Por favor escriba o seleccione el nombre del paciente.");
      return;
    }
    if (!formMasivo.profesional_id) {
      alert("Por favor seleccione el profesional / prestador.");
      return;
    }
    if (!formMasivo.diasSemana || formMasivo.diasSemana.length === 0) {
      alert("Por favor seleccione al menos un día de la semana.");
      return;
    }

    const fechasAInsertar = fechasCalculadasMasivo.filter(f => !fechasExcluidas.includes(f.fechaStr));
    if (fechasAInsertar.length === 0) {
      alert("No hay fechas seleccionadas para crear los turnos.");
      return;
    }

    const conConflicto = fechasAInsertar.filter(f => f.tieneConflicto);
    if (conConflicto.length > 0) {
      const continuar = window.confirm(
        `Atención: ${conConflicto.length} de las fechas calculadas coinciden con turnos ya asignados al profesional:\n\n` +
        conConflicto.map(c => `• ${c.diaNombre} ${c.fechaStr}: ocupado por ${c.pacienteConflicto}`).join('\n') +
        `\n\n¿Desea crear los turnos de todas maneras? (Si prefiere omitir turnos conflictivos, presione Cancelar y haga clic en las fechas en rojo para excluirlas).`
      );
      if (!continuar) return;
    }

    setGuardandoMasivo(true);
    try {
      const horaSeleccionada = formMasivo.horario_especial || formMasivo.hora;
      const profesionalObj = users.find(u => String(u.id) === String(formMasivo.profesional_id));
      const nombreProf = profesionalObj ? profesionalObj.nombre : 'Sin Prof.';

      const notasLibres = (formMasivo.observaciones || '')
        .replace(/^(\[\s*[^\]]+\]\s*)+/, '')
        .trim();
      const obsEmpaquetadas = notasLibres
        ? `[${horaSeleccionada}] [${formMasivo.prestacion}] [${nombreProf}] ${notasLibres}`
        : `[${horaSeleccionada}] [${formMasivo.prestacion}] [${nombreProf}]`;

      const payloads = fechasAInsertar.map(f => ({
        paciente_nombre: formMasivo.paciente_nombre.trim().toUpperCase(),
        profesional_id: formMasivo.profesional_id,
        fecha_inicio: f.fechaISO,
        observaciones: obsEmpaquetadas,
        estado: formMasivo.estado
      }));

      const { error } = await supabase.from('turnos').insert(payloads);
      if (error) throw error;

      alert(`✅ ¡Carga masiva completada con éxito!\n\nSe crearon ${payloads.length} turnos para ${formMasivo.paciente_nombre.trim().toUpperCase()} (${formMasivo.prestacion}) en ${mesesNombres[formMasivo.mes]} ${formMasivo.ano} a las ${horaSeleccionada} hs.`);

      setMesActual(new Date(formMasivo.ano, formMasivo.mes, 1));
      setModalMasivoAbierto(false);
      setFechasExcluidas([]);
      await cargarDatos();
    } catch (err) {
      console.error("Error en carga masiva:", err);
      alert("Ocurrió un error al guardar los turnos masivos: " + (err.message || err));
    } finally {
      setGuardandoMasivo(false);
    }
  }

  // Lógica para Consulta de Horarios Disponibles (Libres)
  const profesionalesParaConsulta = useMemo(() => {
    const idsConTurnos = new Set((turnos || []).map(t => String(t.profesional_id || "").trim()).filter(Boolean));
    let marinaAgregada = false;
    return (users || []).filter(u => {
      const r = (u.rol || "").trim().toUpperCase();
      const esRolProfesional = ["PROFESIONAL", "PROFESIONAL_PLUS"].includes(r);
      const tieneTurnos = idsConTurnos.has(String(u.id).trim());
      if (!esRolProfesional && !tieneTurnos) return false;
      if (esMarinaOlivera(u.id, u.nombre)) {
        if (marinaAgregada) return false;
        marinaAgregada = true;
      }
      return true;
    }).map(u => ({
      ...u,
      nombreLimpio: (u.nombre || "").trim(),
      esClinico: true
    }));
  }, [users, turnos]);

  const abrirModalDisponibles = () => {
    setDispMes(mesActual.getMonth());
    setDispAno(mesActual.getFullYear());
    setDispCopiado(false);

    if (!esAdmin && userData?.id) {
      const miId = usuarioEsMarina
        ? (profesionalesParaConsulta.find(p => esMarinaOlivera(p.id, p.nombre))?.id || String(userData.id))
        : String(userData.id);
      setDispProfesionalesIds([String(miId)]);
    } else if (filtroProfesional) {
      if (filtroEsMarina) {
        const marinaObj = profesionalesParaConsulta.find(p => esMarinaOlivera(p.id, p.nombre));
        setDispProfesionalesIds(marinaObj ? [String(marinaObj.id)] : [String(filtroProfesional)]);
      } else {
        setDispProfesionalesIds([String(filtroProfesional)]);
      }
    } else {
      const clinicos = profesionalesParaConsulta.filter(p => p.esClinico).map(p => String(p.id));
      setDispProfesionalesIds(clinicos.length > 0 ? clinicos : profesionalesParaConsulta.map(p => String(p.id)));
    }

    setModalDisponiblesAbierto(true);
  };

  const toggleProfDisp = (profId) => {
    const idStr = String(profId);
    setDispProfesionalesIds(prev =>
      prev.includes(idStr) ? prev.filter(id => id !== idStr) : [...prev, idStr]
    );
  };

  const toggleDiaSemanaDisp = (diaId) => {
    setDispDiasSemana(prev =>
      prev.includes(diaId) ? prev.filter(d => d !== diaId) : [...prev, diaId].sort()
    );
  };

  const toggleFechaExactaDisp = (diaNum) => {
    setDispFechasExactas(prev =>
      prev.includes(diaNum) ? prev.filter(d => d !== diaNum) : [...prev, diaNum].sort((a, b) => a - b)
    );
  };

  const disponibilidadCalculada = useMemo(() => {
    const profsSeleccionados = profesionalesParaConsulta.filter(p =>
      dispProfesionalesIds.includes(String(p.id))
    );
    if (profsSeleccionados.length === 0) return { dias: [], totalLibres: 0 };

    const horariosBase = listaHorarios.filter(h => {
      const hh = parseInt(h.split(':')[0], 10);
      if (dispFranja === 'manana') return hh < 13;
      if (dispFranja === 'tarde') return hh >= 13;
      return true;
    });

    const totalDias = new Date(dispAno, dispMes + 1, 0).getDate();
    const hoy = new Date();
    const hoyY = hoy.getFullYear();
    const hoyM = hoy.getMonth();
    const hoyD = hoy.getDate();

    const extraerHora = (t) => {
      const obsHora = t.observaciones?.split(']')[0]?.replace('[', '').trim();
      if (obsHora && /^\d{1,2}:\d{2}$/.test(obsHora)) {
        const [hh, mm] = obsHora.split(':');
        return `${hh.padStart(2, '0')}:${mm}`;
      }
      if (t.fecha_inicio) {
        const f = new Date(t.fecha_inicio);
        return `${String(f.getUTCHours()).padStart(2, '0')}:${String(f.getUTCMinutes()).padStart(2, '0')}`;
      }
      return '';
    };

    const diasResultado = [];
    let totalLibres = 0;

    for (let d = 1; d <= totalDias; d++) {
      if (dispSoloFuturos) {
        if (dispAno < hoyY || (dispAno === hoyY && dispMes < hoyM) || (dispAno === hoyY && dispMes === hoyM && d < hoyD)) {
          continue;
        }
      }

      const fechaUtc = new Date(Date.UTC(dispAno, dispMes, d, 12, 0, 0));
      const diaSemanaNum = fechaUtc.getUTCDay();

      if (dispModoDias === 'semana') {
        if (!dispDiasSemana.includes(diaSemanaNum)) continue;
      } else {
        if (!dispFechasExactas.includes(d)) continue;
      }

      const diaLabel = diasSemanaOpciones.find(x => x.id === diaSemanaNum)?.label || '';
      const fechaStr = `${String(d).padStart(2, '0')}/${String(dispMes + 1).padStart(2, '0')}/${dispAno}`;

      const turnosDelDia = (turnos || []).filter(t => {
        if (!t.fecha_inicio) return false;
        const f = new Date(t.fecha_inicio);
        if (f.getUTCFullYear() !== dispAno || f.getUTCMonth() !== dispMes || f.getUTCDate() !== d) return false;
        const est = (t.estado || 'pendiente').trim().toLowerCase();
        return est !== 'cancelado' && est !== 'ausente';
      });

      const porProfesional = profsSeleccionados.map(prof => {
        const pId = String(prof.id).trim();
        const esMar = esMarinaOlivera(prof.id, prof.nombre);
        const turnosProf = turnosDelDia.filter(t => {
          const tProfId = String(t.profesional_id || '').trim();
          return tProfId === pId || (esMar && marinaIds.includes(tProfId));
        });

        const mapaOcupados = {};
        turnosProf.forEach(t => {
          const hr = extraerHora(t);
          if (hr) mapaOcupados[hr] = t.paciente_nombre || 'Ocupado';
        });

        const libres = horariosBase.filter(h => !mapaOcupados[h]);
        const ocupados = horariosBase.filter(h => mapaOcupados[h]).map(h => ({ hora: h, paciente: mapaOcupados[h] }));

        totalLibres += libres.length;
        return { prof, libres, ocupados };
      });

      diasResultado.push({
        dia: d,
        diaSemanaNum,
        diaLabel,
        fechaStr,
        porProfesional
      });
    }

    return { dias: diasResultado, totalLibres };
  }, [
    profesionalesParaConsulta, dispProfesionalesIds, listaHorarios, dispFranja,
    dispAno, dispMes, dispSoloFuturos, dispModoDias, dispDiasSemana, dispFechasExactas,
    turnos, marinaIds
  ]);

  const copiarDisponibilidadTexto = () => {
    if (disponibilidadCalculada.dias.length === 0) return;
    const lineas = [`📅 *Horarios disponibles (${mesesNombres[dispMes]} ${dispAno})*`];
    disponibilidadCalculada.dias.forEach(d => {
      const profsConLibres = d.porProfesional.filter(x => x.libres.length > 0);
      if (profsConLibres.length === 0) return;
      lineas.push(`\n*${d.diaLabel} ${d.fechaStr}*`);
      profsConLibres.forEach(({ prof, libres }) => {
        lineas.push(`• ${prof.nombreLimpio}: ${libres.join(', ')}`);
      });
    });
    navigator.clipboard.writeText(lineas.join('\n')).then(() => {
      setDispCopiado(true);
      setTimeout(() => setDispCopiado(false), 2500);
    });
  };

  return (
    <div style={{ padding: '0', backgroundColor: '#ffffff', color: '#000000', fontSize: '14px', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Barra Superior: Navegación de Mes y Carga Masiva */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px auto', width: '95%', maxWidth: '1000px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button 
            onClick={() => {limpiarFiltroFecha(); setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1))}}
            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}
          >
            ←
          </button>
          <h2 style={{ fontSize: '18px', margin: 0, fontWeight: '800', color: '#0f172a', minWidth: '160px', textAlign: 'center' }}>
            {mesActual.toLocaleString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase()}
          </h2>
          <button 
            onClick={() => {limpiarFiltroFecha(); setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1))}}
            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}
          >
            →
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={abrirModalDisponibles}
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#ffffff',
              border: 'none',
              padding: '10px 18px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 10px rgba(16, 185, 129, 0.28)',
              transition: 'all 0.15s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <span style={{ fontSize: '15px' }}>🟢</span> HORARIOS DISPONIBLES
          </button>

          <button
          onClick={() => abrirModalMasivoConDatos()}
          style={{
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            color: '#ffffff',
            border: 'none',
            padding: '10px 18px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '700',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)',
            transition: 'all 0.15s ease'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <span style={{ fontSize: '15px' }}>⚡</span> CARGA MASIVA (TRATAMIENTOS FIJOS)
        </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginBottom: '20px', padding: '0 10px' }}>
        
        <button 
          onClick={limpiarFiltroFecha} 
          disabled={!filtroFecha}
          style={{ 
            width: '100%', maxWidth: '300px', padding: '10px', 
            background: filtroFecha ? '#dc3545' : '#ccc', color: '#fff', 
            border: 'none', borderRadius: '8px', cursor: filtroFecha ? 'pointer' : 'default', 
            fontWeight: 'bold', fontSize: '14px' 
          }}
        >
          {filtroFecha ? '✖ QUITAR FILTRO DE FECHA' : 'SIN FILTRO DE FECHA'}
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: '100%', maxWidth: '300px' }}>
          <select value={filtroProfesional} onChange={e => setFiltroProfesional(e.target.value)} style={{padding: '10px', fontSize: '16px'}}>
            <option value="">Todos los Profesionales</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
          
          <div style={{ position: 'relative', width: '100%' }}>
            <input 
              type="text" 
              list="lista-pacientes-sugerencias"
              placeholder="Filtrar por paciente..." 
              value={filtroPaciente} 
              onChange={e => setFiltroPaciente(e.target.value)} 
              style={{ padding: '10px 35px 10px 10px', fontSize: '16px', borderRadius: '4px', border: '1px solid #ccc', width: '100%', boxSizing: 'border-box' }}
            />
            <datalist id="lista-pacientes-sugerencias">
              {pacientesUnicos.map((nombre, i) => (
                <option key={i} value={nombre} />
              ))}
            </datalist>

            {filtroPaciente && (
              <button
                onClick={() => setFiltroPaciente('')}
                title="Borrar búsqueda de paciente"
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  padding: '2px 6px'
                }}
                onMouseOver={(e) => e.currentTarget.style.color = '#ef4444'}
                onMouseOut={(e) => e.currentTarget.style.color = '#64748b'}
              >
                ✖
              </button>
            )}
          </div>

          {/* Selector interactivo de pacientes coincidentes */}
          {filtroPaciente.trim() && sugerenciasPacientes.length > 0 && (
            <div style={{ background: '#f8fafc', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#1e40af' }}>
                💡 {sugerenciasPacientes.length === 1 ? 'Paciente coincidente:' : `Seleccionar paciente (${sugerenciasPacientes.length}):`}
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '110px', overflowY: 'auto' }}>
                {sugerenciasPacientes.map((nombre, i) => {
                  const esSeleccionado = filtroPaciente.trim().toLowerCase() === nombre.toLowerCase();
                  return (
                    <button
                      key={i}
                      onClick={() => setFiltroPaciente(nombre)}
                      style={{
                        background: esSeleccionado ? '#2563eb' : '#ffffff',
                        color: esSeleccionado ? '#ffffff' : '#1e40af',
                        border: esSeleccionado ? '1px solid #1d4ed8' : '1px solid #93c5fd',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s'
                      }}
                    >
                      👤 {nombre} {esSeleccionado ? '✓' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ fontSize: '10px', color: '#666', fontWeight: 'bold', textAlign: 'center' }}>FECHA</label>
            <input 
              type="date" 
              value={filtroFechaInput}
              onChange={e => { 
                if(e.target.value) {
                  setFiltroFechaInput(e.target.value);
                  const f = new Date(e.target.value);
                  setFiltroFecha(f.getUTCDate());
                  setMesActual(new Date(f.getFullYear(), f.getMonth(), 1));
                } else {
                  limpiarFiltroFecha();
                }
              }} 
              style={{padding: '10px', fontSize: '16px'}} 
            />
          </div>
        </div>
      </div>

      {/* Resumen Completo de Turnos del Paciente cuando hay búsqueda por nombre */}
      {filtroPaciente.trim() !== '' && (
        <div style={{ width: '95%', maxWidth: '900px', margin: '0 auto 20px auto', background: '#f8fafc', border: '2px solid #3b82f6', borderRadius: '12px', padding: '16px', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15)', position: 'relative' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>🔍</span>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#1e3a8a', fontWeight: 'bold' }}>
                Todos los turnos de "{filtroPaciente.trim()}"
              </h3>
              <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
                {turnosPacienteFiltrado.length} {verSoloFuturos ? 'futuros' : 'registrados'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={() => setVerSoloFuturos(true)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  background: verSoloFuturos ? '#3b82f6' : '#e2e8f0',
                  color: verSoloFuturos ? '#fff' : '#475569'
                }}
              >
                📅 Solo Futuros
              </button>
              <button
                onClick={() => setVerSoloFuturos(false)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  background: !verSoloFuturos ? '#3b82f6' : '#e2e8f0',
                  color: !verSoloFuturos ? '#fff' : '#475569'
                }}
              >
                📜 Histórico
              </button>
              <button
                onClick={() => setFiltroPaciente('')}
                title="Cerrar ventana y borrar búsqueda de paciente"
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  background: '#ef4444',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginLeft: '4px'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#dc2626'}
                onMouseOut={(e) => e.currentTarget.style.background = '#ef4444'}
              >
                ✖ Cerrar
              </button>
            </div>
          </div>

          {turnosPacienteFiltrado.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '14px', background: '#fff', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
              ℹ️ No se encontraron turnos {verSoloFuturos ? 'futuros (a partir de hoy)' : ''} programados para "<strong>{filtroPaciente.trim()}</strong>".
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto', paddingRight: '4px' }}>
              {turnosPacienteFiltrado.map(t => {
                const fObj = new Date(t.fecha_inicio);
                const diaNombre = fObj.toLocaleDateString('es-AR', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();
                const fechaStr = `${String(fObj.getUTCDate()).padStart(2, '0')}/${String(fObj.getUTCMonth() + 1).padStart(2, '0')}/${fObj.getUTCFullYear()}`;
                
                const parts = (t.observaciones || '').split(']') || [];
                const hora = parts[0]?.replace('[', '').trim() || '--:--';
                const prest = parts[1]?.replace('[', '').trim() || '';
                const prof = parts[2]?.replace('[', '').trim() || 'N/A';
                const est = (t.estado || 'pendiente').trim().toLowerCase();

                let bgItem = '#ffffff';
                let borderItem = '#cbd5e1';
                let tagEstado = { bg: '#f1f5f9', color: '#475569', label: '⏳ Pendiente' };

                if (est === 'cancelado' || est === 'ausente') {
                  bgItem = '#fef2f2';
                  borderItem = '#fecaca';
                  tagEstado = { bg: '#fee2e2', color: '#991b1b', label: '❌ Cancelado' };
                } else if (est === 'realizado' || est === 'presente') {
                  bgItem = '#f0fdf4';
                  borderItem = '#bbf7d0';
                  tagEstado = { bg: '#dcfce7', color: '#166534', label: '✅ Realizado' };
                } else if (prest === 'Tratamiento') {
                  bgItem = '#fefce8';
                  borderItem = '#fef08a';
                  tagEstado = { bg: '#fef08a', color: '#856404', label: '⏳ Pendiente' };
                }

                return (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justify: 'space-between',
                      padding: '8px 12px',
                      background: bgItem,
                      border: `1px solid ${borderItem}`,
                      borderRadius: '8px',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                      <span style={{ background: '#3b82f6', color: '#fff', padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                        📅 {diaNombre} {fechaStr}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f172a' }}>
                        🕒 {hora} hs
                      </span>
                      <span style={{ fontSize: '12px', color: '#475569', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                        {prest}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#1e40af' }}>
                        👤 {prof}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 'bold', padding: '3px 8px', borderRadius: '4px', background: tagEstado.bg, color: tagEstado.color }}>
                        {tagEstado.label}
                      </span>
                      <button
                        onClick={() => {
                          const f = new Date(t.fecha_inicio);
                          setMesActual(new Date(f.getUTCFullYear(), f.getUTCMonth(), 1));
                          setDiaSeleccionado(f.getUTCDate());
                          setTurnoEditando(t);
                          setForm({ ...t, hora, prestacion: prest });
                        }}
                        style={{
                          background: '#0284c7',
                          color: '#fff',
                          border: 'none',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        🔍 Ver / Editar en Calendario
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', backgroundColor: '#ffffff', borderTop: '1px solid #ddd', flex: 1, width: '100%' }}>
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
          <div key={d} style={{ textAlign: 'center', background: '#f8f9fa', padding: '10px', fontWeight: 'bold', borderRight: '1px solid #ddd', borderBottom: '1px solid #ddd' }}>{d}</div>
        ))}
        {[...Array(offset)].map((_, i) => <div key={`off-${i}`} style={{ background: '#fcfcfc', minHeight: '100px', borderRight: '1px solid #ddd', borderBottom: '1px solid #ddd' }} />)}
        {[...Array(diasEnMes)].map((_, i) => {
          const dN = i + 1;
          if (filtroFecha && dN !== filtroFecha) {
             return <div key={i} style={{ background: '#f9f9f9', borderRight: '1px solid #ddd', borderBottom: '1px solid #ddd' }} />;
          }

          const tD = (turnosVisibles || []).filter(t => {
            const f = new Date(t.fecha_inicio);
            return f.getUTCDate() === dN && f.getUTCMonth() === mesActual.getMonth() && f.getUTCFullYear() === mesActual.getFullYear();
          });
          return (
            <div key={i} style={{ minHeight: '100px', background: '#ffffff', padding: '5px', borderRight: '1px solid #ddd', borderBottom: '1px solid #ddd', position: 'relative' }}>
              <div onClick={() => { setDiaSeleccionado(dN); setTurnoEditando(null); setForm({...form, paciente_nombre: '', estado: 'pendiente', horario_especial: ''}); }} style={{ cursor: 'pointer', color: '#007bff', fontWeight: 'bold' }}>{dN} +</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {tD.sort((a,b) => (a.observaciones?.split(']')[0] || '').localeCompare(b.observaciones?.split(']')[0] || '')).map(t => {
                  const parts = t.observaciones?.split(']') || [];
                  const hora = parts[0]?.replace('[', '').trim() || '--:--';
                  const prest = parts[1]?.replace('[', '').trim() || '';
                  const prof = parts[2]?.replace('[', '').trim() || 'N/A';

                  const est = (t.estado || '').trim().toLowerCase();

                  // Jerarquía de colores:
                  // 1. CANCELADO / AUSENTE -> ROJO SIEMPRE (incluso si es Tratamiento)
                  // 2. REALIZADO / PRESENTE -> VERDE
                  // 3. PENDIENTE Tratamiento -> AMARILLO
                  // 4. PENDIENTE Otra Prestación -> CELESTE
                  let bgCard = '#eefaff';
                  let borderCard = '#b8daff';
                  let textNombreColor = '#0056b3';
                  let decoracionTexto = 'none';

                  if (est === 'cancelado' || est === 'ausente') {
                    bgCard = '#f8d7da'; // Rojo claro
                    borderCard = '#f5c6cb';
                    textNombreColor = '#721c24'; // Rojo oscuro
                    decoracionTexto = 'line-through';
                  } else if (est === 'realizado' || est === 'presente') {
                    bgCard = '#d4edda'; // Verde claro
                    borderCard = '#c3e6cb';
                    textNombreColor = '#155724'; // Verde oscuro
                  } else if (prest === 'Tratamiento') {
                    bgCard = '#fff3cd'; // Amarillo / crema suave
                    borderCard = '#ffeeba';
                    textNombreColor = '#856404';
                  }

                  return (
                    <div 
                      key={t.id} 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setTurnoEditando(t); 
                        setForm({...t, hora: hora, prestacion: prest}); 
                        setDiaSeleccionado(dN); 
                      }} 
                      style={{ 
                        fontSize: '11px', 
                        background: bgCard,
                        border: `1px solid ${borderCard}`,
                        padding: '4px 6px', 
                        cursor: 'pointer', 
                        borderRadius: '4px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                        transition: 'transform 0.1s'
                      }}
                    >
                      <div style={{ color: textNombreColor, fontWeight: 'bold', fontSize: '12px', textDecoration: decoracionTexto }}>
                        {t.paciente_nombre.toUpperCase()} {est === 'cancelado' ? '❌ (CANCELADO)' : ''}
                      </div>
                      <div style={{ color: est === 'cancelado' ? '#721c24' : '#333' }}>
                        <strong>{hora}</strong> | {prest} | <b>{prof}</b>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        })}
      </div>

      {diaSeleccionado && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#ffffff', padding: '20px', width: '320px', borderRadius: '15px' }}>
            <h3>{turnoEditando ? 'Editar Turno' : 'Nuevo Turno'}</h3>
            <input 
              placeholder="Paciente" 
              list="lista-pacientes-sugerencias"
              value={form.paciente_nombre} 
              onChange={e => setForm({...form, paciente_nombre: e.target.value})} 
              style={{width: '100%', marginBottom: 10, padding: '8px'}} 
            />
            <select value={form.prestacion} onChange={e => setForm({...form, prestacion: e.target.value})} style={{width: '100%', marginBottom: 10, padding: '8px'}}>{prestaciones.map(p => <option key={p} value={p}>{p}</option>)}</select>
            <select value={form.profesional_id} onChange={e => setForm({...form, profesional_id: e.target.value})} style={{width: '100%', marginBottom: 10, padding: '8px'}}><option value="">Profesional...</option>{users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
            <input placeholder="Ej: 13:15" value={form.horario_especial} onChange={e => setForm({...form, horario_especial: e.target.value})} style={{width: '100%', marginBottom: 10, padding: '8px'}} />
            <select value={form.hora} onChange={e => setForm({...form, hora: e.target.value})} style={{width: '100%', marginBottom: 10, padding: '8px'}}>{listaHorarios.map(h => <option key={h} value={h}>{h}</option>)}</select>
            <select value={form.estado} onChange={e => setForm({...form, estado: e.target.value})} style={{width: '100%', marginBottom: 10, padding: '8px'}}><option value="pendiente">⏳ Pendiente</option><option value="realizado">✅ Realizado</option><option value="cancelado">❌ Cancelado</option></select>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={guardarTurno} style={{flex: 1, padding: '10px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold'}}>GUARDAR</button>
                <button onClick={() => setDiaSeleccionado(null)} style={{flex: 1, padding: '10px', background: '#ccc', border: 'none', borderRadius: '5px', cursor: 'pointer'}}>CERRAR</button>
              </div>
              {!turnoEditando && (
                <button
                  type="button"
                  onClick={() => {
                    const fechaDia = new Date(Date.UTC(mesActual.getFullYear(), mesActual.getMonth(), diaSeleccionado, 12, 0, 0));
                    const diaSemanaNum = fechaDia.getUTCDay();
                    abrirModalMasivoConDatos({
                      paciente_nombre: form.paciente_nombre,
                      prestacion: form.prestacion || 'Tratamiento',
                      profesional_id: form.profesional_id,
                      mes: mesActual.getMonth(),
                      ano: mesActual.getFullYear(),
                      diasSemana: [diaSemanaNum],
                      hora: form.hora,
                      horario_especial: form.horario_especial,
                      estado: form.estado || 'pendiente'
                    });
                    setDiaSeleccionado(null);
                  }}
                  style={{
                    padding: '8px 10px',
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    border: '1.5px dashed #3b82f6',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '11.5px',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  ⚡ Repetir este día todo el mes (Masivo)
                </button>
              )}
              {turnoEditando && (
                <button onClick={eliminarTurno} style={{padding: '10px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer'}}>ELIMINAR TURNO</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Carga Masiva de Turnos */}
      {modalMasivoAbierto && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            maxWidth: '480px',
            width: '100%',
            maxHeight: '92vh',
            overflowY: 'auto',
            padding: '22px 24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
            color: '#1e293b'
          }}>
            {/* Cabecera del modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⚡</span> Carga Masiva de Turnos
                </h3>
                <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  Programa turnos fijos recurrentes para todo un mes
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalMasivoAbierto(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: '#94a3b8', cursor: 'pointer', padding: '2px 6px', borderRadius: '4px' }}
                onMouseOver={(e) => e.currentTarget.style.color = '#ef4444'}
                onMouseOut={(e) => e.currentTarget.style.color = '#94a3b8'}
              >
                ✖
              </button>
            </div>

            {/* Formulario */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              
              {/* Campo Paciente */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                  Paciente
                </label>
                <input
                  placeholder="Escriba o elija el nombre del paciente..."
                  list="lista-pacientes-sugerencias"
                  value={formMasivo.paciente_nombre}
                  onChange={e => setFormMasivo({ ...formMasivo, paciente_nombre: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              {/* Campo Prestación */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                  Prestación
                </label>
                <select
                  value={formMasivo.prestacion}
                  onChange={e => setFormMasivo({ ...formMasivo, prestacion: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', background: '#fff' }}
                >
                  {prestaciones.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Campo Profesional */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                  Profesional / Prestador
                </label>
                <select
                  value={formMasivo.profesional_id}
                  onChange={e => setFormMasivo({ ...formMasivo, profesional_id: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', background: '#fff' }}
                >
                  <option value="">Seleccione profesional...</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Mes y Año */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                    Mes
                  </label>
                  <select
                    value={formMasivo.mes}
                    onChange={e => setFormMasivo({ ...formMasivo, mes: parseInt(e.target.value) })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', background: '#fff' }}
                  >
                    {mesesNombres.map((m, idx) => (
                      <option key={idx} value={idx}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                    Año
                  </label>
                  <input
                    type="number"
                    value={formMasivo.ano}
                    onChange={e => setFormMasivo({ ...formMasivo, ano: parseInt(e.target.value) || new Date().getFullYear() })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Día de la semana */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                  Día(s) de la semana en que se repite
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {diasSemanaOpciones.map(d => {
                    const activo = formMasivo.diasSemana.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleDiaSemana(d.id)}
                        style={{
                          flex: 1,
                          minWidth: '46px',
                          padding: '7px 4px',
                          borderRadius: '8px',
                          border: activo ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                          background: activo ? '#2563eb' : '#f8fafc',
                          color: activo ? '#ffffff' : '#334155',
                          fontWeight: '700',
                          fontSize: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        {d.corto}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Horario (Horario especial + Selector) */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                  Horario
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <input
                    placeholder="Ej: 13:15 (Especial)"
                    value={formMasivo.horario_especial}
                    onChange={e => setFormMasivo({ ...formMasivo, horario_especial: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                  <select
                    value={formMasivo.hora}
                    onChange={e => setFormMasivo({ ...formMasivo, hora: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', background: '#fff' }}
                  >
                    {listaHorarios.map(h => (
                      <option key={h} value={h}>{h} hs</option>
                    ))}
                  </select>
                </div>
                {formMasivo.horario_especial && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#2563eb' }}>
                    * Se usará el horario manual: <strong>{formMasivo.horario_especial} hs</strong>
                  </p>
                )}
              </div>

              {/* Estado */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                  Estado inicial
                </label>
                <select
                  value={formMasivo.estado}
                  onChange={e => setFormMasivo({ ...formMasivo, estado: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', background: '#fff' }}
                >
                  <option value="pendiente">⏳ Pendiente</option>
                  <option value="realizado">✅ Realizado</option>
                  <option value="cancelado">❌ Cancelado</option>
                </select>
              </div>

              {/* Observaciones (Opcional) */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                  Observaciones (opcional)
                </label>
                <input
                  placeholder="Notas adicionales..."
                  value={formMasivo.observaciones}
                  onChange={e => setFormMasivo({ ...formMasivo, observaciones: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              {/* Vista Previa de Días Calculados */}
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px', marginTop: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#166534' }}>
                    📅 Turnos calculados ({fechasCalculadasMasivo.filter(f => !fechasExcluidas.includes(f.fechaStr)).length} de {fechasCalculadasMasivo.length}):
                  </span>
                  <span style={{ fontSize: '10.5px', color: '#166534' }}>
                    Clic en una fecha para omitir/incluir
                  </span>
                </div>

                {fechasCalculadasMasivo.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                    No hay días seleccionados para este mes.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {fechasCalculadasMasivo.map(f => {
                      const excluida = fechasExcluidas.includes(f.fechaStr);
                      let bgChip = '#dcfce7';
                      let colorChip = '#166534';
                      let borderChip = '#86efac';

                      if (excluida) {
                        bgChip = '#f1f5f9';
                        colorChip = '#94a3b8';
                        borderChip = '#cbd5e1';
                      } else if (f.tieneConflicto) {
                        bgChip = '#fee2e2';
                        colorChip = '#991b1b';
                        borderChip = '#fca5a5';
                      }

                      return (
                        <button
                          key={f.fechaStr}
                          type="button"
                          onClick={() => toggleFechaExcluida(f.fechaStr)}
                          title={excluida ? 'Clic para incluir' : f.tieneConflicto ? `Conflicto con ${f.pacienteConflicto}. Clic para excluir.` : 'Clic para omitir'}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: `1px solid ${borderChip}`,
                            background: bgChip,
                            color: colorChip,
                            fontSize: '11px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            textDecoration: excluida ? 'line-through' : 'none'
                          }}
                        >
                          {f.diaNombre} {f.diaNumero}/{formMasivo.mes + 1}
                          {excluida ? ' (Omitido)' : f.tieneConflicto ? ' ⚠️' : ' ✓'}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Botones de Acción */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={ejecutarCargaMasiva}
                  disabled={guardandoMasivo || fechasCalculadasMasivo.filter(f => !fechasExcluidas.includes(f.fechaStr)).length === 0}
                  style={{
                    flex: 2,
                    padding: '12px',
                    background: guardandoMasivo ? '#93c5fd' : '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: guardandoMasivo ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)',
                    transition: 'background 0.2s'
                  }}
                >
                  {guardandoMasivo
                    ? 'Guardando turnos...'
                    : `⚡ GENERAR ${fechasCalculadasMasivo.filter(f => !fechasExcluidas.includes(f.fechaStr)).length} TURNOS`
                  }
                </button>
                <button
                  type="button"
                  onClick={() => setModalMasivoAbierto(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  CERRAR
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Modal de Consulta de Horarios Disponibles (Libres) */}
      {modalDisponiblesAbierto && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "rgba(15, 23, 42, 0.7)",
          backdropFilter: "blur(3px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1060,
          padding: "14px",
          boxSizing: "border-box"
        }}>
          <div style={{
            background: "#ffffff",
            width: "100%",
            maxWidth: "960px",
            height: "90vh",
            maxHeight: "90vh",
            borderRadius: "16px",
            boxShadow: "0 20px 35px rgba(0, 0, 0, 0.25)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }}>
            {/* Header Modal (Fijo arriba) */}
            <div style={{
              background: "linear-gradient(135deg, #059669, #047857)",
              color: "#ffffff",
              padding: "14px 22px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexShrink: 0
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>🟢</span> Consulta de Horarios Disponibles (Libres)
                </h3>
                <p style={{ margin: "3px 0 0 0", fontSize: "12px", opacity: 0.92 }}>
                  Filtrá por uno o varios profesionales, elegí los días y hacé clic en cualquier horario libre para agendarlo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalDisponiblesAbierto(false)}
                style={{
                  background: "rgba(255,255,255,0.2)",
                  border: "none",
                  color: "#fff",
                  fontSize: "18px",
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  cursor: "pointer",
                  fontWeight: "bold",
                  flexShrink: 0
                }}
              >
                ✖
              </button>
            </div>

            {/* Cuerpo completo con scroll único (Filtros + Barra Resumen Sticky + Resultados) */}
            <div style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              background: "#ffffff"
            }}>
              {/* Panel de Filtros */}
              <div style={{
                padding: "16px 22px",
                background: "#f8fafc",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                flexShrink: 0
              }}>
                {/* Fila 1: Mes, Año, Franja y Checkboxes */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: "bold", color: "#475569", marginBottom: "4px" }}>MES</label>
                    <select
                      value={dispMes}
                      onChange={(e) => setDispMes(Number(e.target.value))}
                      style={{ padding: "7px 10px", borderRadius: "7px", border: "1px solid #cbd5e1", fontSize: "13px", fontWeight: "bold", background: "#fff", color: "#0f172a" }}
                    >
                      {mesesNombres.map((m, idx) => <option key={idx} value={idx}>{m}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: "bold", color: "#475569", marginBottom: "4px" }}>AÑO</label>
                    <input
                      type="number"
                      value={dispAno}
                      onChange={(e) => setDispAno(Number(e.target.value))}
                      style={{ width: "84px", padding: "7px 10px", borderRadius: "7px", border: "1px solid #cbd5e1", fontSize: "13px", fontWeight: "bold", color: "#0f172a", background: "#fff" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: "bold", color: "#475569", marginBottom: "4px" }}>FRANJA HORARIA</label>
                    <select
                      value={dispFranja}
                      onChange={(e) => setDispFranja(e.target.value)}
                      style={{ padding: "7px 10px", borderRadius: "7px", border: "1px solid #cbd5e1", fontSize: "13px", fontWeight: "bold", background: "#fff", color: "#0f172a" }}
                    >
                      <option value="todas">Todo el día (09:00 a 20:45)</option>
                      <option value="manana">Solo Mañana (09:00 a 12:45)</option>
                      <option value="tarde">Solo Tarde (14:00 a 20:45)</option>
                    </select>
                  </div>

                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: "600", color: "#334155", cursor: "pointer", padding: "7px 10px", background: "#fff", border: "1px solid #cbd5e1", borderRadius: "7px" }}>
                    <input
                      type="checkbox"
                      checked={dispSoloFuturos}
                      onChange={(e) => setDispSoloFuturos(e.target.checked)}
                    />
                    Solo desde hoy en adelante
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: "600", color: "#334155", cursor: "pointer", padding: "7px 10px", background: "#fff", border: "1px solid #cbd5e1", borderRadius: "7px" }}>
                    <input
                      type="checkbox"
                      checked={dispMostrarOcupados}
                      onChange={(e) => setDispMostrarOcupados(e.target.checked)}
                    />
                    Ver también ocupados
                  </label>
                </div>

                {/* Fila 2: Selección de Uno o Varios Profesionales */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "6px" }}>
                    <label style={{ fontSize: "11px", fontWeight: "bold", color: "#475569" }}>
                      PROFESIONALES ({dispProfesionalesIds.length} seleccionados):
                    </label>
                    {esAdmin && (
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => setDispProfesionalesIds(profesionalesParaConsulta.map(p => String(p.id)))}
                          style={{ padding: "4px 10px", fontSize: "11px", fontWeight: "700", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#ffffff", color: "#334155", cursor: "pointer" }}
                        >
                          Todos
                        </button>
                        <button
                          type="button"
                          onClick={() => setDispProfesionalesIds([])}
                          style={{ padding: "4px 10px", fontSize: "11px", fontWeight: "700", borderRadius: "6px", border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", cursor: "pointer" }}
                        >
                          Limpiar
                        </button>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {(esAdmin ? profesionalesParaConsulta : profesionalesParaConsulta.filter(p => dispProfesionalesIds.includes(String(p.id)))).map(p => {
                      const activo = dispProfesionalesIds.includes(String(p.id));
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={!esAdmin}
                          onClick={() => toggleProfDisp(p.id)}
                          style={{
                            padding: "5px 11px",
                            borderRadius: "16px",
                            fontSize: "12px",
                            fontWeight: "700",
                            cursor: esAdmin ? "pointer" : "default",
                            border: activo ? "1.5px solid #059669" : "1px solid #cbd5e1",
                            background: activo ? "#10b981" : "#ffffff",
                            color: activo ? "#ffffff" : "#475569",
                            transition: "all 0.12s"
                          }}
                        >
                          {activo ? "✓ " : ""}{p.nombreLimpio}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Fila 3: Elección de Días */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "6px" }}>
                    <label style={{ fontSize: "11px", fontWeight: "bold", color: "#475569" }}>
                      DÍAS A CONSULTAR:
                    </label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        onClick={() => setDispModoDias("semana")}
                        style={{
                          padding: "4px 10px", borderRadius: "6px", fontSize: "11.5px", fontWeight: "700", cursor: "pointer",
                          border: dispModoDias === "semana" ? "1.5px solid #0284c7" : "1px solid #cbd5e1",
                          background: dispModoDias === "semana" ? "#e0f2fe" : "#fff",
                          color: dispModoDias === "semana" ? "#0369a1" : "#475569"
                        }}
                      >
                        📆 Por Días de Semana / Todos
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDispModoDias("fechas");
                          if (dispFechasExactas.length === 0) {
                            setDispFechasExactas([new Date().getDate()]);
                          }
                        }}
                        style={{
                          padding: "4px 10px", borderRadius: "6px", fontSize: "11.5px", fontWeight: "700", cursor: "pointer",
                          border: dispModoDias === "fechas" ? "1.5px solid #0284c7" : "1px solid #cbd5e1",
                          background: dispModoDias === "fechas" ? "#e0f2fe" : "#fff",
                          color: dispModoDias === "fechas" ? "#0369a1" : "#475569"
                        }}
                      >
                        🎯 Elegir Fechas Exactas del Mes
                      </button>
                    </div>
                  </div>

                  {dispModoDias === "semana" ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                      {diasSemanaOpciones.map(d => {
                        const sel = dispDiasSemana.includes(d.id);
                        return (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => toggleDiaSemanaDisp(d.id)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "8px",
                              fontSize: "12px",
                              fontWeight: "700",
                              cursor: "pointer",
                              border: sel ? "1.5px solid #0284c7" : "1px solid #cbd5e1",
                              background: sel ? "#0284c7" : "#ffffff",
                              color: sel ? "#ffffff" : "#475569"
                            }}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setDispDiasSemana([1, 2, 3, 4, 5])}
                        style={{ padding: "6px 10px", fontSize: "11px", fontWeight: "700", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#f1f5f9", color: "#334155", cursor: "pointer", marginLeft: "4px" }}
                      >
                        Lun–Vie
                      </button>
                      <button
                        type="button"
                        onClick={() => setDispDiasSemana([1, 2, 3, 4, 5, 6, 0])}
                        style={{ padding: "6px 10px", fontSize: "11px", fontWeight: "700", borderRadius: "6px", border: "1px solid #059669", background: "#ecfdf5", color: "#047857", cursor: "pointer" }}
                      >
                        Todos los días
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                        {Array.from({ length: new Date(dispAno, dispMes + 1, 0).getDate() }, (_, idx) => idx + 1).map(dNum => {
                          const sel = dispFechasExactas.includes(dNum);
                          const dWeek = new Date(Date.UTC(dispAno, dispMes, dNum, 12, 0, 0)).getUTCDay();
                          const corto = diasSemanaOpciones.find(x => x.id === dWeek)?.corto || "";
                          return (
                            <button
                              key={dNum}
                              type="button"
                              onClick={() => toggleFechaExactaDisp(dNum)}
                              style={{
                                padding: "5px 9px",
                                borderRadius: "6px",
                                fontSize: "11.5px",
                                fontWeight: "700",
                                cursor: "pointer",
                                border: sel ? "1.5px solid #0284c7" : "1px solid #cbd5e1",
                                background: sel ? "#0284c7" : "#ffffff",
                                color: sel ? "#ffffff" : "#334155"
                              }}
                            >
                              {corto} {dNum}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          onClick={() => setDispFechasExactas(Array.from({ length: new Date(dispAno, dispMes + 1, 0).getDate() }, (_, i) => i + 1))}
                          style={{ padding: "4px 10px", fontSize: "11px", fontWeight: "700", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#fff", color: "#334155", cursor: "pointer" }}
                        >
                          Todos del mes
                        </button>
                        <button
                          type="button"
                          onClick={() => setDispFechasExactas([])}
                          style={{ padding: "4px 10px", fontSize: "11px", fontWeight: "700", borderRadius: "6px", border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", cursor: "pointer" }}
                        >
                          Limpiar fechas
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Barra de Resumen + Copiar (Sticky al hacer scroll) */}
              <div style={{
                position: "sticky",
                top: 0,
                zIndex: 10,
                padding: "10px 22px",
                background: "#ecfdf5",
                borderBottom: "1px solid #a7f3d0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "10px",
                flexShrink: 0
              }}>
                <div style={{ fontSize: "13px", color: "#065f46", fontWeight: "700" }}>
                  📊 {disponibilidadCalculada.dias.length} día(s) consultados • <span style={{ fontSize: "15px" }}>{disponibilidadCalculada.totalLibres}</span> horario(s) libres encontrados
                </div>
                <button
                  type="button"
                  onClick={copiarDisponibilidadTexto}
                  disabled={disponibilidadCalculada.totalLibres === 0}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "7px",
                    border: "none",
                    background: dispCopiado ? "#047857" : "#059669",
                    color: "#fff",
                    fontWeight: "700",
                    fontSize: "12px",
                    cursor: disponibilidadCalculada.totalLibres === 0 ? "not-allowed" : "pointer",
                    opacity: disponibilidadCalculada.totalLibres === 0 ? 0.5 : 1
                  }}
                >
                  {dispCopiado ? "✓ ¡Copiado para WhatsApp!" : "📋 Copiar horarios libres (WhatsApp)"}
                </button>
              </div>

              {/* Resultados por Día y Profesional */}
              <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: "14px", background: "#ffffff" }}>
                {dispProfesionalesIds.length === 0 ? (
                  <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                    👆 Seleccioná al menos un profesional arriba para ver sus horarios libres.
                  </div>
                ) : disponibilidadCalculada.dias.length === 0 ? (
                  <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                    ℹ️ No hay días que coincidan con los filtros seleccionados (revisá los días elegidos o el filtro «Solo desde hoy en adelante»).
                  </div>
                ) : (
                  disponibilidadCalculada.dias.map(diaObj => (
                    <div
                      key={diaObj.dia}
                      style={{
                        border: "1px solid #cbd5e1",
                        borderRadius: "10px",
                        overflow: "hidden",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                        flexShrink: 0
                      }}
                    >
                      <div style={{
                        background: "#f1f5f9",
                        padding: "9px 14px",
                        fontWeight: "800",
                        color: "#0f172a",
                        fontSize: "13.5px",
                        borderBottom: "1px solid #e2e8f0",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}>
                        <span>📅 {diaObj.diaLabel.toUpperCase()} {diaObj.fechaStr}</span>
                        <span style={{ fontSize: "11.5px", fontWeight: "700", color: "#047857" }}>
                          {diaObj.porProfesional.reduce((acc, x) => acc + x.libres.length, 0)} libres en total
                        </span>
                      </div>

                      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "12px" }}>
                        {diaObj.porProfesional.map(({ prof, libres, ocupados }) => (
                          <div key={prof.id} style={{ borderBottom: "1px dashed #e2e8f0", paddingBottom: "10px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                              <span style={{ fontWeight: "700", fontSize: "13px", color: "#1e293b" }}>👤 {prof.nombreLimpio}</span>
                              <span style={{
                                fontSize: "11px",
                                fontWeight: "700",
                                padding: "2px 8px",
                                borderRadius: "10px",
                                background: libres.length > 0 ? "#dcfce7" : "#fee2e2",
                                color: libres.length > 0 ? "#166534" : "#991b1b"
                              }}>
                                {libres.length > 0 ? `${libres.length} disponibles` : "Sin turnos libres"}
                              </span>
                            </div>

                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                              {libres.map(hr => (
                                <button
                                  key={hr}
                                  type="button"
                                  onClick={() => {
                                    setMesActual(new Date(dispAno, dispMes, 1));
                                    setDiaSeleccionado(diaObj.dia);
                                    setTurnoEditando(null);
                                    setForm(prev => ({
                                      ...prev,
                                      hora: hr,
                                      profesional_id: String(prof.id),
                                      paciente_nombre: "",
                                      estado: "pendiente",
                                      horario_especial: ""
                                    }));
                                    setModalDisponiblesAbierto(false);
                                  }}
                                  title={`Agendar turno el ${diaObj.fechaStr} a las ${hr} con ${prof.nombreLimpio}`}
                                  style={{
                                    padding: "5px 10px",
                                    borderRadius: "7px",
                                    border: "1px solid #86efac",
                                    background: "#f0fdf4",
                                    color: "#15803d",
                                    fontWeight: "700",
                                    fontSize: "12px",
                                    cursor: "pointer",
                                    transition: "all 0.12s"
                                  }}
                                  onMouseOver={(e) => {
                                    e.currentTarget.style.background = "#10b981";
                                    e.currentTarget.style.color = "#ffffff";
                                  }}
                                  onMouseOut={(e) => {
                                    e.currentTarget.style.background = "#f0fdf4";
                                    e.currentTarget.style.color = "#15803d";
                                  }}
                                >
                                  ✅ {hr}
                                </button>
                              ))}

                              {dispMostrarOcupados && ocupados.map(oc => (
                                <span
                                  key={oc.hora}
                                  title={`Ocupado: ${oc.paciente}`}
                                  style={{
                                    padding: "5px 10px",
                                    borderRadius: "7px",
                                    border: "1px solid #fecaca",
                                    background: "#fef2f2",
                                    color: "#991b1b",
                                    fontWeight: "600",
                                    fontSize: "11.5px",
                                    textDecoration: "line-through"
                                  }}
                                >
                                  ❌ {oc.hora} ({oc.paciente})
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Footer Modal (Fijo abajo) */}
            <div style={{ padding: "12px 22px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setModalDisponiblesAbierto(false)}
                style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#ffffff", color: "#334155", fontWeight: "700", cursor: "pointer" }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AgendaMensualPro;