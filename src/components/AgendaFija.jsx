import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase.js';
import {
  fetchTodasSesionesFijas,
  archivarCambioSesion,
  consolidarMesAgenda,
  parsearMetadataSesion,
  construirObservacionVigencia,
  calcularHastaAnterior,
  sincronizarSnapshotMesPaciente,
  obtenerFechaHoyISO,
  obtenerPeriodoActual,
  formatearPeriodoNombre
} from '../lib/agendaHistorial.js';

function AgendaFija({ userData }) {
  const [sesiones, setSesiones] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [users, setUsers] = useState([]);
  const [guardando, setGuardando] = useState(false);

  // Estados de UI
  const [vistaActiva, setVistaActiva] = useState('agenda'); // 'agenda' | 'auditoria' | 'historial'
  const [modalEdicionAbierto, setModalEdicionAbierto] = useState(false);

  // Estados de formulario
  const [dia, setDia] = useState('Lunes');
  const [hora, setHora] = useState('09:00');
  const [horarioManual, setHorarioManual] = useState('');
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState('');
  const [prestadorSeleccionado, setPrestadorSeleccionado] = useState('');
  const [fechaVigencia, setFechaVigencia] = useState(obtenerFechaHoyISO());
  const [editId, setEditId] = useState(null);
  const [modalCambioModalidad, setModalCambioModalidad] = useState({
    abierto: false,
    pacienteId: '',
    pacienteNombre: '',
    cantidadTurnos: 0,
    fechaVigencia: obtenerFechaHoyISO()
  });

  // Filtros
  const [diaConsulta, setDiaConsulta] = useState('Lunes');
  const [profesionalFiltroId, setProfesionalFiltroId] = useState('');
  const [filtroPacienteAgenda, setFiltroPacienteAgenda] = useState('');
  const [pacienteConsultaId, setPacienteConsultaId] = useState('');
  const [filtroPaciente, setFiltroPaciente] = useState('');

  // Estados para Historial y Consolidación Mensual
  const [periodoAConsolidar, setPeriodoAConsolidar] = useState(obtenerPeriodoActual());
  const [consolidandoMes, setConsolidandoMes] = useState(false);
  const [modoHistorial, setModoHistorial] = useState('paciente'); // 'paciente' | 'mes'
  const [histPacienteId, setHistPacienteId] = useState('');
  const [histFiltroPaciente, setHistFiltroPaciente] = useState('');
  const [histMesFiltro, setHistMesFiltro] = useState(obtenerPeriodoActual());
  const [histMesBuscador, setHistMesBuscador] = useState('');

  const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  const rol = userData?.rol?.toUpperCase();
  const esAdminOdireccion = rol === 'ADMINISTRACION' || rol === 'DIRECCION';

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
    cargarDatos(true);
  }, []);

  useEffect(() => {
    if (!esAdminOdireccion && userData?.id) {
      setProfesionalFiltroId(String(userData.id));
      if (!prestadorSeleccionado) {
        setPrestadorSeleccionado(String(userData.id));
      }
    }
  }, [userData?.id, esAdminOdireccion]);

  const idToUuid = (id) => '00000000-0000-0000-0000-' + String(id).padStart(12, '0');

  async function cargarDatos(verificarAutoConsolidacion = false) {
    try {
      const [sData, pRes, uRes] = await Promise.all([
        fetchTodasSesionesFijas(),
        supabase.from('pacientes_motor').select('id_paciente, nombre_apellido, dni').order('nombre_apellido', { ascending: true }),
        supabase.from('users').select('*').order('nombre', { ascending: true })
      ]);

      const mappedPacientes = (pRes.data || []).map(p => ({
        id: idToUuid(p.id_paciente),
        id_paciente: p.id_paciente,
        nombre: p.nombre_apellido,
        dni: p.dni
      }));

      setPacientes(mappedPacientes);
      setUsers(uRes.data || []);

      // Auto-consolidar el mes actual la primera vez que se abre en un nuevo mes (>= 2026-11)
      const periodoHoy = obtenerPeriodoActual();
      if (verificarAutoConsolidacion && periodoHoy >= '2026-11') {
        const yaExisteMesHoy = (sData || []).some(s => {
          if ((s.estado || '').toUpperCase() !== 'HISTORICO') return false;
          const meta = parsearMetadataSesion(s);
          return meta.categoria === 'HIST_MES' && meta.periodo === periodoHoy;
        });

        if (!yaExisteMesHoy) {
          const resCons = await consolidarMesAgenda(periodoHoy, { sobreescribir: false });
          if (resCons && !resCons.yaExistia && resCons.cantidad > 0) {
            const sDataActualizada = await fetchTodasSesionesFijas();
            setSesiones(sDataActualizada || []);
            return;
          }
        }
      }

      setSesiones(sData || []);
    } catch (err) {
      console.error('Error al cargar Agenda Fija:', err);
    }
  }

  async function recargarPacientes() {
    const { data: pData } = await supabase.from('pacientes_motor').select('id_paciente, nombre_apellido, dni').order('nombre_apellido', { ascending: true });
    if (pData) {
      setPacientes(pData.map(p => ({
        id: idToUuid(p.id_paciente),
        id_paciente: p.id_paciente,
        nombre: p.nombre_apellido,
        dni: p.dni
      })));
    }
  }

  const generarHorarios = () => {
    const arr = [];
    const rangos = [{ inicio: 9, fin: 12, minFin: 45 }, { inicio: 14, fin: 20, minFin: 0 }];
    rangos.forEach(({ inicio, fin, minFin }) => {
      let h = inicio, m = 0;
      while (h < fin || (h === fin && m <= minFin)) {
        arr.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        m += 45;
        if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
      }
    });
    return arr;
  };

  const puedeEditar = (s) => {
    if (esAdminOdireccion) return true;
    const sProfId = String(s.profesional_id || '').trim();
    if (sProfId === String(userData?.id || '').trim()) return true;
    if (esMarinaOlivera(userData?.id, userData?.nombre)) {
      const marinaIds = getMarinaIds();
      if (marinaIds.includes(sProfId)) return true;
    }
    return false;
  };

  async function guardarSesion() {
    const p = pacientes.find(p => String(p.id) === String(pacienteSeleccionado));
    if (!p) { alert("Error: Seleccioná un paciente válido."); return; }

    setGuardando(true);
    const hoy = obtenerFechaHoyISO();
    const vigenciaFinal = fechaVigencia && /^\d{4}-\d{2}-\d{2}$/.test(fechaVigencia) ? fechaVigencia : hoy;
    const horaFinal = horarioManual.trim() !== '' ? horarioManual : hora;
    const payload = {
      paciente_id: p.id,
      paciente_nombre: p.nombre,
      profesional_id: prestadorSeleccionado,
      dia_semana: dia,
      hora: horaFinal,
      asistencia: 'Pendiente',
      observaciones: construirObservacionVigencia(vigenciaFinal)
    };

    try {
      if (editId) {
        const sesionOriginal = sesiones.find(s => s.id === editId);
        let archivoCreado = null;

        if (sesionOriginal) {
          const cambioRelevante =
            sesionOriginal.dia_semana !== payload.dia_semana ||
            sesionOriginal.hora !== payload.hora ||
            String(sesionOriginal.profesional_id || '') !== String(payload.profesional_id || '') ||
            String(sesionOriginal.paciente_id || '') !== String(payload.paciente_id || '');

          if (cambioRelevante) {
            const metaOrig = parsearMetadataSesion(sesionOriginal);
            const desdeOrig = metaOrig.desde || (sesionOriginal.created_at ? String(sesionOriginal.created_at).slice(0, 10) : vigenciaFinal);
            const hastaAnterior = calcularHastaAnterior(vigenciaFinal, desdeOrig);
            archivoCreado = await archivarCambioSesion(sesionOriginal, 'EDITADO', '', hastaAnterior);
          }
        }

        const { error } = await supabase.from('sesiones_fijas').update(payload).eq('id', editId);
        if (error) throw error;

        if (vigenciaFinal.endsWith('-01')) {
          const sincronizado = await sincronizarSnapshotMesPaciente(p.id, vigenciaFinal.slice(0, 7));
          if (sincronizado) {
            await cargarDatos(false);
            setEditId(null);
            setModalEdicionAbierto(false);
            alert(`✅ Sesión guardada (vigente desde ${vigenciaFinal} — historial y mes actualizados)`);
            setGuardando(false);
            return;
          }
        }

        setSesiones(prev => {
          const updated = prev.map(s => s.id === editId ? { ...s, ...payload } : s);
          return archivoCreado ? [...updated, archivoCreado] : updated;
        });
        setEditId(null);
      } else {
        const { data, error } = await supabase
          .from('sesiones_fijas')
          .insert([{ ...payload, estado: 'ACTIVO' }])
          .select();
        if (error) throw error;

        if (vigenciaFinal.endsWith('-01')) {
          const sincronizado = await sincronizarSnapshotMesPaciente(p.id, vigenciaFinal.slice(0, 7));
          if (sincronizado) {
            await cargarDatos(false);
            setModalEdicionAbierto(false);
            alert(`✅ Sesión guardada (vigente desde ${vigenciaFinal} — historial y mes actualizados)`);
            setGuardando(false);
            return;
          }
        }

        if (data) setSesiones(prev => [...prev, ...data]);
      }
      setModalEdicionAbierto(false);
      alert(`✅ Sesión guardada (vigente desde ${vigenciaFinal}, con historial protegido)`);
    } catch (e) {
      alert("Error: " + e.message);
    }
    setGuardando(false);
  }

  async function eliminarSesion(sesionObj) {
    const s = typeof sesionObj === 'object' ? sesionObj : sesiones.find(x => x.id === sesionObj);
    if (!s) return;

    if (window.confirm(`¿Seguro de quitar el turno de ${s.paciente_nombre} (${s.dia_semana} ${s.hora}) de la agenda vigente?\n\nSe guardará automáticamente en el Historial hasta hoy para conservar el registro de meses anteriores.`)) {
      try {
        const archivoCreado = await archivarCambioSesion(s, 'ELIMINADO');
        const { error } = await supabase.from('sesiones_fijas').delete().eq('id', s.id);
        if (error) throw error;
        setSesiones(prev => {
          const sinBorrada = prev.filter(item => item.id !== s.id);
          return archivoCreado ? [...sinBorrada, archivoCreado] : sinBorrada;
        });
      } catch (e) {
        alert("Error al eliminar sesión: " + e.message);
      }
    }
  }

  async function alternarSuspension(s) {
    const estaSuspendido = (s.estado || 'ACTIVO').toUpperCase() === 'SUSPENDIDO';
    const nuevoEstado = estaSuspendido ? 'ACTIVO' : 'SUSPENDIDO';
    const accionTexto = estaSuspendido ? 'reactivar' : 'suspender';
    const avisoExtra = estaSuspendido
      ? '\n\nEl turno volverá a aparecer normalmente en Asistencia Pacientes.'
      : '\n\nEl turno NO se eliminará, pero dejará de leerse en Asistencia Pacientes hasta que lo reactives (y queda guardado en el Historial hasta hoy).';

    if (!window.confirm(`¿Seguro que deseas ${accionTexto} el turno de ${s.paciente_nombre} (${s.dia_semana} ${s.hora})?${avisoExtra}`)) {
      return;
    }

    try {
      const hoy = obtenerFechaHoyISO();
      let archivoCreado = null;
      const updateFields = { estado: nuevoEstado };

      if (!estaSuspendido) {
        archivoCreado = await archivarCambioSesion(s, 'SUSPENDIDO');
      } else {
        updateFields.observaciones = construirObservacionVigencia(hoy);
      }

      const { error } = await supabase
        .from('sesiones_fijas')
        .update(updateFields)
        .eq('id', s.id);
      if (error) throw error;

      setSesiones(prev => {
        const updated = prev.map(item => item.id === s.id ? { ...item, ...updateFields } : item);
        return archivoCreado ? [...updated, archivoCreado] : updated;
      });
    } catch (e) {
      alert('Error al cambiar estado del turno: ' + e.message);
    }
  }

  function cambiarModalidadPaciente(pacienteId) {
    const sesionesDelPaciente = sesionesVigentes.filter(s => String(s.paciente_id) === String(pacienteId));
    if (sesionesDelPaciente.length === 0) {
      alert('Este paciente no tiene sesiones vigentes para cerrar.');
      return;
    }

    const nombrePac = sesionesDelPaciente[0].paciente_nombre || 'el paciente';
    setModalCambioModalidad({
      abierto: true,
      pacienteId: String(pacienteId),
      pacienteNombre: nombrePac,
      cantidadTurnos: sesionesDelPaciente.length,
      fechaVigencia: obtenerFechaHoyISO()
    });
  }

  async function confirmarCambioModalidad() {
    const { pacienteId, pacienteNombre, fechaVigencia: fechaModalidad } = modalCambioModalidad;
    const sesionesDelPaciente = sesionesVigentes.filter(s => String(s.paciente_id) === String(pacienteId));
    if (sesionesDelPaciente.length === 0) {
      setModalCambioModalidad(prev => ({ ...prev, abierto: false }));
      return;
    }

    const vigenciaFinal = fechaModalidad && /^\d{4}-\d{2}-\d{2}$/.test(fechaModalidad)
      ? fechaModalidad
      : obtenerFechaHoyISO();

    try {
      setGuardando(true);
      const archivos = [];
      for (const s of sesionesDelPaciente) {
        const metaOrig = parsearMetadataSesion(s);
        const desdeOrig = metaOrig.desde || (s.created_at ? String(s.created_at).slice(0, 10) : vigenciaFinal);
        const hastaAnterior = calcularHastaAnterior(vigenciaFinal, desdeOrig);
        const arch = await archivarCambioSesion(
          s,
          'CAMBIO_MODALIDAD',
          `Cambio de modalidad (nueva rige desde ${vigenciaFinal})`,
          hastaAnterior
        );
        if (arch) archivos.push(arch);
      }

      const idsAEliminar = sesionesDelPaciente.map(s => s.id);
      const { error } = await supabase.from('sesiones_fijas').delete().in('id', idsAEliminar);
      if (error) throw error;

      if (vigenciaFinal.endsWith('-01')) {
        await sincronizarSnapshotMesPaciente(pacienteId, vigenciaFinal.slice(0, 7));
        await cargarDatos(false);
      } else {
        setSesiones(prev => [
          ...prev.filter(s => !idsAEliminar.includes(s.id)),
          ...archivos
        ]);
      }

      setModalCambioModalidad(prev => ({ ...prev, abierto: false }));
      setPacienteSeleccionado(String(pacienteId));
      setFechaVigencia(vigenciaFinal);
      setEditId(null);
      setVistaActiva('agenda');
      alert(`✅ Modalidad anterior archivada hasta el día previo a ${vigenciaFinal}.\n\nYa podés cargar los nuevos turnos para ${pacienteNombre} en "📅 Agenda" (ya quedó seleccionada la fecha ${vigenciaFinal}).`);
    } catch (e) {
      alert('Error al cambiar modalidad: ' + e.message);
    } finally {
      setGuardando(false);
    }
  }

  async function handleConsolidarMes() {
    if (!periodoAConsolidar || !/^\d{4}-\d{2}$/.test(periodoAConsolidar)) {
      alert('Seleccioná un mes válido (AAAA-MM).');
      return;
    }

    const yaExiste = consolidadosPorMes[periodoAConsolidar]?.length > 0;
    const msgConfirm = yaExiste
      ? `El mes ${formatearPeriodoNombre(periodoAConsolidar)} ya tiene ${consolidadosPorMes[periodoAConsolidar].length} sesiones consolidadas.\n\n¿Querés REEMPLAZAR esa foto consolidada con las sesiones ACTIVAS actuales?`
      : `¿Consolidar la foto mensual de ${formatearPeriodoNombre(periodoAConsolidar)} con todas las sesiones ACTIVAS actuales (${sesionesVigentes.filter(s => (s.estado || 'ACTIVO').toUpperCase() === 'ACTIVO').length} sesiones)?`;

    if (!window.confirm(msgConfirm)) return;

    setConsolidandoMes(true);
    try {
      const res = await consolidarMesAgenda(periodoAConsolidar, { sobreescribir: yaExiste });
      await cargarDatos(false);
      setHistMesFiltro(periodoAConsolidar);
      alert(`✅ ¡Mes ${formatearPeriodoNombre(periodoAConsolidar)} consolidado con éxito!\n\nSe guardaron ${res.cantidad} sesiones activas en el historial de ese mes.`);
    } catch (e) {
      alert('Error al consolidar mes: ' + e.message);
    } finally {
      setConsolidandoMes(false);
    }
  }

  function iniciarEdicion(s) {
    setEditId(s.id); setDia(s.dia_semana); setHora(s.hora); setHorarioManual('');
    setPacienteSeleccionado(String(s.paciente_id)); setPrestadorSeleccionado(String(s.profesional_id));
    setFechaVigencia(obtenerFechaHoyISO());
  }

  // Separar sesiones vigentes (ACTIVO / SUSPENDIDO) de registros históricos (HISTORICO)
  const sesionesVigentes = useMemo(
    () => sesiones.filter(s => (s.estado || 'ACTIVO').toUpperCase() !== 'HISTORICO'),
    [sesiones]
  );

  const sesionesHistoricas = useMemo(
    () => sesiones.filter(s => (s.estado || '').toUpperCase() === 'HISTORICO'),
    [sesiones]
  );

  // Agrupar consolidados mensuales por período YYYY-MM
  const consolidadosPorMes = useMemo(() => {
    const mapa = {};
    sesionesHistoricas.forEach(s => {
      const meta = parsearMetadataSesion(s);
      if (meta.categoria === 'HIST_MES' && meta.periodo) {
        if (!mapa[meta.periodo]) mapa[meta.periodo] = [];
        mapa[meta.periodo].push({ ...s, meta });
      }
    });
    return mapa;
  }, [sesionesHistoricas]);

  const periodosConsolidadosLista = useMemo(
    () => Object.keys(consolidadosPorMes).sort((a, b) => b.localeCompare(a)),
    [consolidadosPorMes]
  );

  const marinaIds = getMarinaIds();
  const usuarioEsMarina = esMarinaOlivera(userData?.id, userData?.nombre);
  const filtroEsMarina = marinaIds.includes(String(profesionalFiltroId || '').trim());

  // Lógica de filtrado avanzada para Agenda vigente
  const sesionesVisibles = sesionesVigentes.filter(s => {
    const sProfId = String(s.profesional_id || '').trim();

    let coincideProfesional = true;
    if (usuarioEsMarina) {
      if (!profesionalFiltroId || filtroEsMarina) {
        coincideProfesional = marinaIds.includes(sProfId);
      } else {
        coincideProfesional = sProfId === String(profesionalFiltroId).trim();
      }
    } else if (filtroEsMarina) {
      coincideProfesional = marinaIds.includes(sProfId);
    } else if (profesionalFiltroId !== '') {
      coincideProfesional = sProfId === String(profesionalFiltroId).trim();
    } else if (!esAdminOdireccion && userData?.id) {
      coincideProfesional = sProfId === String(userData.id).trim();
    }

    const coincidePaciente = filtroPacienteAgenda === '' || (s.paciente_nombre || '').toLowerCase().includes(filtroPacienteAgenda.toLowerCase());
    return coincideProfesional && coincidePaciente && s.dia_semana === diaConsulta;
  }).sort((a, b) => a.hora.localeCompare(b.hora));

  const pacientesFiltrados = pacientes.filter(p => p.nombre?.toLowerCase().includes(filtroPaciente.toLowerCase().trim()));
  const pacientesFiltradosHist = pacientes.filter(p => p.nombre?.toLowerCase().includes(histFiltroPaciente.toLowerCase().trim()));

  // Datos de historial para el paciente seleccionado en la pestaña Historial
  const historialPacienteSeleccionado = useMemo(() => {
    if (!histPacienteId) return { vigentes: [], cambios: [], meses: [] };
    const vigentes = sesionesVigentes
      .filter(s => String(s.paciente_id) === String(histPacienteId))
      .map(s => ({ ...s, meta: parsearMetadataSesion(s) }));

    const histPac = sesionesHistoricas
      .filter(s => String(s.paciente_id) === String(histPacienteId))
      .map(s => ({ ...s, meta: parsearMetadataSesion(s) }));

    const cambios = histPac
      .filter(s => s.meta.categoria === 'HIST_CAMBIO')
      .sort((a, b) => String(b.meta.hasta || '').localeCompare(String(a.meta.hasta || '')));

    const porMesMap = {};
    histPac
      .filter(s => s.meta.categoria === 'HIST_MES' && s.meta.periodo)
      .forEach(s => {
        if (!porMesMap[s.meta.periodo]) porMesMap[s.meta.periodo] = [];
        porMesMap[s.meta.periodo].push(s);
      });

    const meses = Object.keys(porMesMap)
      .sort((a, b) => b.localeCompare(a))
      .map(periodo => ({
        periodo,
        items: porMesMap[periodo].sort((a, b) => (a.dia_semana || '').localeCompare(b.dia_semana || '') || (a.hora || '').localeCompare(b.hora || ''))
      }));

    return { vigentes, cambios, meses };
  }, [histPacienteId, sesionesVigentes, sesionesHistoricas]);

  return (
    <div style={{ color: '#fff', padding: '20px', maxWidth: '880px', margin: 'auto' }}>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button onClick={() => setVistaActiva('agenda')} style={btnTabStyle(vistaActiva === 'agenda')}>📅 Agenda</button>
        <button onClick={() => setVistaActiva('auditoria')} style={btnTabStyle(vistaActiva === 'auditoria')}>🔎 Por Paciente</button>
        <button onClick={() => setVistaActiva('historial')} style={btnTabStyle(vistaActiva === 'historial')}>📜 Historial y Consolidado Mensual</button>
      </div>

      {vistaActiva === 'agenda' && (
        <>
          <div style={cardStyle}>
            <h3>{editId ? '✏️ Editar Sesión' : '➕ Nueva Sesión'}</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              <select style={inputStyle} value={dia} onChange={(e) => setDia(e.target.value)}>{dias.map(d => <option key={d} value={d}>{d}</option>)}</select>
              <select style={inputStyle} value={hora} onChange={(e) => { setHora(e.target.value); setHorarioManual(''); }}>{generarHorarios().map(h => <option key={h} value={h}>{h}</option>)}</select>
              <select style={inputStyle} value={pacienteSeleccionado} onChange={(e) => setPacienteSeleccionado(e.target.value)} onFocus={recargarPacientes}><option value="">Paciente...</option>{pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
              <select style={inputStyle} value={prestadorSeleccionado} onChange={(e) => setPrestadorSeleccionado(e.target.value)}><option value="">Profesional...</option>{users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 'bold' }}>📅 Vigente desde:</label>
                <input
                  type="date"
                  style={{ ...inputStyle, flex: 1, minWidth: '160px' }}
                  value={fechaVigencia}
                  onChange={(e) => setFechaVigencia(e.target.value)}
                />
              </div>
              <button disabled={guardando} onClick={guardarSesion} style={btnAccionStyle}>{guardando ? '...' : (editId ? 'ACTUALIZAR' : 'GUARDAR')}</button>
            </div>
          </div>

          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <select
                style={inputStyle}
                value={profesionalFiltroId}
                onChange={(e) => setProfesionalFiltroId(e.target.value)}
              >
                <option value="">{esAdminOdireccion ? "Todos los prof." : (usuarioEsMarina ? "Ver mi agenda completa (Directa + Por Sesión)" : "Ver mi agenda")}</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
              <input style={inputStyle} placeholder="Filtrar por paciente..." onChange={(e) => setFiltroPacienteAgenda(e.target.value)} />
            </div>

            <div style={{ display: 'flex', gap: '5px', margin: '10px 0' }}>
              {dias.map(d => <button key={d} onClick={() => setDiaConsulta(d)} style={btnTabStyle(diaConsulta === d)}>{d.substring(0, 3)}</button>)}
            </div>
            {sesionesVisibles.map(s => {
              const prof = users.find(u => String(u.id) === String(s.profesional_id));
              const estaSuspendido = (s.estado || 'ACTIVO').toUpperCase() === 'SUSPENDIDO';
              return (
                <div key={s.id} style={{ ...filaStyle, opacity: estaSuspendido ? 0.65 : 1, background: estaSuspendido ? '#1a1111' : 'transparent', borderRadius: estaSuspendido ? '6px' : 0 }}>
                  <span style={{ fontWeight: 'bold', width: '80px', textDecoration: estaSuspendido ? 'line-through' : 'none', color: estaSuspendido ? '#f87171' : '#fff' }}>{s.hora}</span>
                  <span style={{ flexGrow: 1 }}>
                    <span style={{ textDecoration: estaSuspendido ? 'line-through' : 'none', color: estaSuspendido ? '#cbd5e1' : '#fff' }}>{s.paciente_nombre}</span>
                    {' '}
                    <span style={{ color: '#888', fontSize: '0.9rem' }}>({prof?.nombre || 'Sin prof'})</span>
                    {estaSuspendido && (
                      <span style={{
                        marginLeft: '8px',
                        background: '#78350f',
                        color: '#fcd34d',
                        border: '1px solid #f59e0b',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}>
                        ⏸️ SUSPENDIDO
                      </span>
                    )}
                  </span>
                  {puedeEditar(s) && (
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <button onClick={() => { iniciarEdicion(s); setModalEdicionAbierto(true); }} title="Editar turno" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px' }}>✏️</button>
                      <button
                        onClick={() => alternarSuspension(s)}
                        title={estaSuspendido ? "Reactivar turno" : "Suspender turno (no se borra, no sale en Asistencia Pacientes)"}
                        style={{
                          background: estaSuspendido ? '#064e3b' : '#451a03',
                          border: estaSuspendido ? '1px solid #10b981' : '1px solid #f59e0b',
                          color: estaSuspendido ? '#6ee7b7' : '#fcd34d',
                          borderRadius: '6px',
                          padding: '3px 8px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 'bold'
                        }}
                      >
                        {estaSuspendido ? '▶️ Reactivar' : '⏸️ Suspender'}
                      </button>
                      <button onClick={() => eliminarSesion(s)} title="Eliminar turno (conserva historial)" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px' }}>🗑️</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {vistaActiva === 'auditoria' && (
        <div style={cardStyle}>
          <input style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} placeholder="Buscar paciente..." onChange={(e) => setFiltroPaciente(e.target.value)} onFocus={recargarPacientes} />
          <div style={{ maxHeight: '150px', overflowY: 'auto', margin: '10px 0' }}>
            {pacientesFiltrados.map(p => (
              <div key={p.id} onClick={() => setPacienteConsultaId(p.id)} style={{ padding: '10px', background: p.id === pacienteConsultaId ? '#00f2ff' : 'transparent', color: p.id === pacienteConsultaId ? '#000' : '#fff', cursor: 'pointer', borderRadius: '6px' }}>{p.nombre}</div>
            ))}
          </div>

          {pacienteConsultaId && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px', paddingTop: '8px', borderTop: '1px solid #222' }}>
              <button
                type="button"
                onClick={() => { setHistPacienteId(pacienteConsultaId); setModoHistorial('paciente'); setVistaActiva('historial'); }}
                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #38bdf8', background: '#0c4a6e', color: '#bae6fd', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                📜 Ver Historial de Este Paciente
              </button>
              {esAdminOdireccion && (
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => cambiarModalidadPaciente(pacienteConsultaId)}
                  style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #f59e0b', background: '#451a03', color: '#fcd34d', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  🔄 Cerrar Modalidad Actual y Empezar Nueva
                </button>
              )}
            </div>
          )}

          {pacienteConsultaId && dias.map(d => {
            const turnos = sesionesVigentes.filter(s => s.paciente_id == pacienteConsultaId && s.dia_semana === d).sort((a, b) => a.hora.localeCompare(b.hora));
            if (turnos.length === 0) return null;
            return (
              <div key={d} style={{ borderTop: '1px solid #333', marginTop: '10px' }}>
                <h4 style={{ color: '#00f2ff' }}>{d}</h4>
                {turnos.map(s => {
                  const prof = users.find(u => String(u.id) === String(s.profesional_id));
                  const estaSuspendido = (s.estado || 'ACTIVO').toUpperCase() === 'SUSPENDIDO';
                  return (
                    <div key={s.id} style={{ ...filaStyle, justifyContent: 'space-between', opacity: estaSuspendido ? 0.65 : 1, background: estaSuspendido ? '#1a1111' : 'transparent', borderRadius: estaSuspendido ? '6px' : 0 }}>
                      <span>
                        <span style={{ textDecoration: estaSuspendido ? 'line-through' : 'none', color: estaSuspendido ? '#f87171' : '#fff' }}>{s.hora} - {s.paciente_nombre}</span>
                        {' '}
                        <span style={{ color: '#888', fontSize: '0.9rem' }}>({prof?.nombre || 'Sin prof'})</span>
                        {estaSuspendido && (
                          <span style={{
                            marginLeft: '8px',
                            background: '#78350f',
                            color: '#fcd34d',
                            border: '1px solid #f59e0b',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            ⏸️ SUSPENDIDO
                          </span>
                        )}
                      </span>
                      {puedeEditar(s) && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <button onClick={() => { iniciarEdicion(s); setModalEdicionAbierto(true); }} title="Editar turno" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px' }}>✏️</button>
                          <button
                            onClick={() => alternarSuspension(s)}
                            title={estaSuspendido ? "Reactivar turno" : "Suspender turno"}
                            style={{
                              background: estaSuspendido ? '#064e3b' : '#451a03',
                              border: estaSuspendido ? '1px solid #10b981' : '1px solid #f59e0b',
                              color: estaSuspendido ? '#6ee7b7' : '#fcd34d',
                              borderRadius: '6px',
                              padding: '3px 8px',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: 'bold'
                            }}
                          >
                            {estaSuspendido ? '▶️ Reactivar' : '⏸️ Suspender'}
                          </button>
                          <button onClick={() => eliminarSesion(s)} title="Eliminar turno (conserva historial)" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px' }}>🗑️</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {vistaActiva === 'historial' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Panel de Consolidación Mensual */}
          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 8px 0', color: '#00f2ff' }}>📸 Consolidación Mensual de Agenda Fija</h3>
            <p style={{ margin: '0 0 12px 0', fontSize: '12.5px', color: '#cbd5e1', lineHeight: '1.45' }}>
              Cada mes queda guardado automáticamente como respaldo para que al cobrar facturas atrasadas de Obras Sociales se liquide al prestador que atendía al paciente en ese mes. También se guarda historial automático cada vez que editás, suspendés o eliminás un turno.
            </p>

            {esAdminOdireccion && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', background: '#111827', padding: '12px', borderRadius: '10px', border: '1px solid #1f2937' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>MES A CONSOLIDAR</label>
                  <input
                    type="month"
                    value={periodoAConsolidar}
                    onChange={(e) => setPeriodoAConsolidar(e.target.value)}
                    style={{ ...inputStyle, padding: '7px 10px' }}
                  />
                </div>
                <button
                  type="button"
                  disabled={consolidandoMes}
                  onClick={handleConsolidarMes}
                  style={{ ...btnAccionStyle, padding: '10px 16px', marginTop: '14px' }}
                >
                  {consolidandoMes
                    ? 'Consolidando...'
                    : (consolidadosPorMes[periodoAConsolidar]?.length > 0 ? '🔄 Actualizar Consolidado del Mes' : '📸 Consolidar Mes Seleccionado')}
                </button>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '14px' }}>
                  {consolidadosPorMes[periodoAConsolidar]?.length > 0 ? (
                    <span style={{ color: '#34d399', fontWeight: 'bold' }}>
                      ✅ Ya consolidado ({consolidadosPorMes[periodoAConsolidar].length} sesiones)
                    </span>
                  ) : (
                    <span style={{ color: '#fbbf24' }}>⏳ Aún sin consolidar manualmente</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Selector de Vista de Historial */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <button onClick={() => setModoHistorial('paciente')} style={btnTabStyle(modoHistorial === 'paciente')}>👤 Historial por Paciente</button>
              <button onClick={() => setModoHistorial('mes')} style={btnTabStyle(modoHistorial === 'mes')}>📆 Ver Foto de un Mes ({periodosConsolidadosLista.length})</button>
            </div>

            {modoHistorial === 'paciente' ? (
              <div>
                <input
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', marginBottom: '8px' }}
                  placeholder="🔍 Buscar paciente para ver su historial..."
                  value={histFiltroPaciente}
                  onChange={(e) => setHistFiltroPaciente(e.target.value)}
                  onFocus={recargarPacientes}
                />
                <div style={{ maxHeight: '140px', overflowY: 'auto', marginBottom: '14px', border: '1px solid #222', borderRadius: '8px' }}>
                  {pacientesFiltradosHist.map(p => (
                    <div
                      key={p.id}
                      onClick={() => setHistPacienteId(p.id)}
                      style={{
                        padding: '8px 12px',
                        background: p.id === histPacienteId ? '#00f2ff' : 'transparent',
                        color: p.id === histPacienteId ? '#000' : '#fff',
                        cursor: 'pointer',
                        fontWeight: p.id === histPacienteId ? 'bold' : 'normal',
                        borderBottom: '1px solid #1a1a1a'
                      }}
                    >
                      {p.nombre}
                    </div>
                  ))}
                </div>

                {!histPacienteId ? (
                  <p style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>
                    Seleccioná un paciente arriba para ver su historial de cambios y consolidados mensuales.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* 1. Agenda Vigente Actual */}
                    <div style={{ background: '#0f172a', border: '1px solid #1e3a8a', borderRadius: '10px', padding: '12px' }}>
                      <h4 style={{ margin: '0 0 8px 0', color: '#60a5fa', fontSize: '14px' }}>
                        ✅ Agenda Vigente Actual ({historialPacienteSeleccionado.vigentes.length})
                      </h4>
                      {historialPacienteSeleccionado.vigentes.length === 0 ? (
                        <p style={{ margin: 0, color: '#94a3b8', fontSize: '12.5px' }}>Sin turnos vigentes actualmente.</p>
                      ) : (
                        historialPacienteSeleccionado.vigentes.map(s => {
                          const prof = users.find(u => String(u.id) === String(s.profesional_id));
                          const estaSusp = (s.estado || 'ACTIVO').toUpperCase() === 'SUSPENDIDO';
                          return (
                            <div key={s.id} style={{ fontSize: '13px', padding: '5px 0', borderBottom: '1px dashed #1e293b', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                              <span>
                                <strong>{s.dia_semana} {s.hora}</strong> — {prof?.nombre || 'Sin prof'}
                                {estaSusp && <span style={{ marginLeft: '8px', color: '#fbbf24', fontSize: '11px' }}>(SUSPENDIDO)</span>}
                              </span>
                              <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                                Vigente desde: {s.meta?.desde || (s.created_at ? String(s.created_at).slice(0, 10) : 'S/D')}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* 2. Historial de Cambios */}
                    <div style={{ background: '#1c1917', border: '1px solid #78350f', borderRadius: '10px', padding: '12px' }}>
                      <h4 style={{ margin: '0 0 8px 0', color: '#fbbf24', fontSize: '14px' }}>
                        🔄 Historial de Cambios / Modalidades Anteriores ({historialPacienteSeleccionado.cambios.length})
                      </h4>
                      {historialPacienteSeleccionado.cambios.length === 0 ? (
                        <p style={{ margin: 0, color: '#94a3b8', fontSize: '12.5px' }}>Aún no se registraron cambios de días, horarios o prestadores para este paciente.</p>
                      ) : (
                        historialPacienteSeleccionado.cambios.map(s => {
                          const prof = users.find(u => String(u.id) === String(s.profesional_id));
                          return (
                            <div key={s.id} style={{ fontSize: '13px', padding: '6px 0', borderBottom: '1px dashed #44403c', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                              <span>
                                <span style={{ background: '#451a03', color: '#fcd34d', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 'bold', marginRight: '6px' }}>
                                  {s.meta?.accion || 'CAMBIO'}
                                </span>
                                <strong>{s.dia_semana} {s.hora}</strong> — {prof?.nombre || 'Sin prof'}
                              </span>
                              <span style={{ fontSize: '11.5px', color: '#d6d3d1' }}>
                                Período: <strong>{s.meta?.desde || 'S/D'}</strong> → <strong>{s.meta?.hasta || 'S/D'}</strong>
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* 3. Consolidados Mes por Mes */}
                    <div style={{ background: '#052e16', border: '1px solid #166534', borderRadius: '10px', padding: '12px' }}>
                      <h4 style={{ margin: '0 0 8px 0', color: '#4ade80', fontSize: '14px' }}>
                        📅 Consolidados Mes por Mes ({historialPacienteSeleccionado.meses.length})
                      </h4>
                      {historialPacienteSeleccionado.meses.length === 0 ? (
                        <p style={{ margin: 0, color: '#cbd5e1', fontSize: '12.5px' }}>No hay fotos mensuales consolidadas para este paciente todavía.</p>
                      ) : (
                        historialPacienteSeleccionado.meses.map(mObj => (
                          <div key={mObj.periodo} style={{ marginBottom: '10px', background: 'rgba(0,0,0,0.3)', padding: '8px 10px', borderRadius: '8px' }}>
                            <div style={{ fontWeight: 'bold', color: '#86efac', fontSize: '13px', marginBottom: '4px' }}>
                              {formatearPeriodoNombre(mObj.periodo)} ({mObj.periodo}) — {mObj.items.length} sesión(es)
                            </div>
                            {mObj.items.map(s => {
                              const prof = users.find(u => String(u.id) === String(s.profesional_id));
                              return (
                                <div key={s.id} style={{ fontSize: '12.5px', color: '#e2e8f0', padding: '2px 0' }}>
                                  • {s.dia_semana} {s.hora} — <strong>{prof?.nombre || 'Sin prof'}</strong>
                                </div>
                              );
                            })}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <select
                    style={{ ...inputStyle, flex: 1, minWidth: '180px' }}
                    value={histMesFiltro}
                    onChange={(e) => setHistMesFiltro(e.target.value)}
                  >
                    {periodosConsolidadosLista.length === 0 && (
                      <option value="">Sin meses consolidados</option>
                    )}
                    {periodosConsolidadosLista.map(p => (
                      <option key={p} value={p}>
                        {formatearPeriodoNombre(p)} ({consolidadosPorMes[p].length} sesiones)
                      </option>
                    ))}
                  </select>
                  <input
                    style={{ ...inputStyle, flex: 1, minWidth: '180px' }}
                    placeholder="Filtrar paciente o profesional..."
                    value={histMesBuscador}
                    onChange={(e) => setHistMesBuscador(e.target.value)}
                  />
                </div>

                {(!consolidadosPorMes[histMesFiltro] || consolidadosPorMes[histMesFiltro].length === 0) ? (
                  <p style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                    No hay sesiones consolidadas para ese mes.
                  </p>
                ) : (
                  <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid #222', borderRadius: '8px' }}>
                    {consolidadosPorMes[histMesFiltro]
                      .filter(s => {
                        const q = histMesBuscador.trim().toLowerCase();
                        if (!q) return true;
                        const prof = users.find(u => String(u.id) === String(s.profesional_id));
                        return (s.paciente_nombre || '').toLowerCase().includes(q) || (prof?.nombre || '').toLowerCase().includes(q);
                      })
                      .sort((a, b) => (a.paciente_nombre || '').localeCompare(b.paciente_nombre || '') || (a.dia_semana || '').localeCompare(b.dia_semana || ''))
                      .map(s => {
                        const prof = users.find(u => String(u.id) === String(s.profesional_id));
                        return (
                          <div key={s.id} style={{ ...filaStyle, justifyContent: 'space-between', fontSize: '13px' }}>
                            <span>
                              <strong>{s.paciente_nombre}</strong> — {s.dia_semana} {s.hora}
                            </span>
                            <span style={{ color: '#38bdf8', fontWeight: '600' }}>
                              {prof?.nombre || 'Sin prof'}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE EDICIÓN */}
      {modalEdicionAbierto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ ...cardStyle, width: '90%', maxWidth: '420px' }}>
            <h3>✏️ Editar Turno</h3>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '-6px', marginBottom: '12px' }}>
              Al guardar cambios, la versión anterior queda archivada automáticamente en el Historial hasta el día previo a la fecha de vigencia elegida.
            </p>
            <div style={{ display: 'grid', gap: '10px' }}>
              <select style={inputStyle} value={dia} onChange={(e) => setDia(e.target.value)}>{dias.map(d => <option key={d} value={d}>{d}</option>)}</select>
              <input style={inputStyle} value={hora} onChange={(e) => setHora(e.target.value)} />
              <select style={inputStyle} value={prestadorSeleccionado} onChange={(e) => setPrestadorSeleccionado(e.target.value)}>{users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', color: '#38bdf8', fontWeight: 'bold', marginBottom: '4px' }}>
                  📅 Vigente a partir del:
                </label>
                <input
                  type="date"
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                  value={fechaVigencia}
                  onChange={(e) => setFechaVigencia(e.target.value)}
                />
              </div>
              <button disabled={guardando} onClick={guardarSesion} style={btnAccionStyle}>{guardando ? 'GUARDANDO...' : 'GUARDAR'}</button>
              <button onClick={() => { setModalEdicionAbierto(false); setEditId(null); }} style={{ ...btnAccionStyle, background: '#444', color: '#fff' }}>CERRAR</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CAMBIO COMPLETO DE MODALIDAD CON FECHA */}
      {modalCambioModalidad.abierto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ ...cardStyle, width: '92%', maxWidth: '450px', border: '1px solid #f59e0b' }}>
            <h3 style={{ marginTop: 0, color: '#fbbf24' }}>🔄 Cambiar Modalidad de {modalCambioModalidad.pacienteNombre}</h3>
            <p style={{ fontSize: '12.5px', color: '#cbd5e1', lineHeight: '1.45' }}>
              Se archivarán sus <strong>{modalCambioModalidad.cantidadTurnos} turno(s)</strong> actuales en el Historial hasta el día previo a la fecha elegida, y se limpiará su agenda vigente para cargar la nueva modalidad.
            </p>
            <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#38bdf8', fontWeight: 'bold', marginBottom: '5px' }}>
                  📅 Nueva modalidad vigente a partir del:
                </label>
                <input
                  type="date"
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                  value={modalCambioModalidad.fechaVigencia}
                  onChange={(e) => setModalCambioModalidad(prev => ({ ...prev, fechaVigencia: e.target.value }))}
                />
              </div>
              <button
                type="button"
                disabled={guardando}
                onClick={confirmarCambioModalidad}
                style={{ ...btnAccionStyle, background: '#f59e0b', color: '#000' }}
              >
                {guardando ? 'ARCHIVANDO...' : '✅ CONFIRMAR Y CARGAR NUEVA MODALIDAD'}
              </button>
              <button
                type="button"
                disabled={guardando}
                onClick={() => setModalCambioModalidad(prev => ({ ...prev, abierto: false }))}
                style={{ ...btnAccionStyle, background: '#444', color: '#fff' }}
              >
                CANCELAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle = { background: '#0a0a0a', border: '1px solid #333', borderRadius: '15px', padding: '20px' };
const inputStyle = { background: '#000', border: '1px solid #444', color: '#fff', padding: '10px', borderRadius: '8px' };
const btnAccionStyle = { background: '#00f2ff', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', padding: '10px', fontWeight: 'bold' };
const filaStyle = { padding: '10px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center' };
const btnTabStyle = (activo) => ({ padding: '10px', borderRadius: '8px', border: 'none', background: activo ? '#00f2ff' : '#222', color: activo ? '#000' : '#fff', cursor: 'pointer', fontWeight: 'bold' });

export default AgendaFija;
