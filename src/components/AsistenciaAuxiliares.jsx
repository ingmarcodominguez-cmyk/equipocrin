import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const parsearDecimal = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  const str = String(val).trim().replace(',', '.');
  const num = Number.parseFloat(str);
  return isNaN(num) ? 0 : num;
};

export default function AsistenciaAuxiliares({ onVolver, usuario }) {
  const [pestañaActiva, setPestañaActiva] = useState('asistencia_diaria'); // 'asistencia_diaria', 'auxiliares', 'historial'
  const [fechaTrabajo, setFechaTrabajo] = useState('');
  
  // Maestros de Auxiliares
  const [auxiliares, setAuxiliares] = useState([]);
  const [cargandoAuxiliares, setCargandoAuxiliares] = useState(false);

  // Registro de Asistencias del Día
  const [asistenciasDia, setAsistenciasDia] = useState([]);
  const [cargandoAsistencias, setCargandoAsistencias] = useState(false);

  // Historial Completo
  const [historialCompleto, setHistorialCompleto] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  // Estados para Modales/Formularios de Asistencia
  const [modalAsistenciaAbierto, setModalAsistenciaAbierto] = useState(false);
  const [auxiliarSeleccionadoAsist, setAuxiliarSeleccionadoAsist] = useState(null);
  const [registroEdicion, setRegistroEdicion] = useState(null); // Si estamos editando uno existente
  
  // Campos del formulario de asistencia
  const [tipoLiq, setTipoLiq] = useState('HORA');
  const [horaEntradaM, setHoraEntradaM] = useState('');
  const [horaSalidaM, setHoraSalidaM] = useState('');
  const [horaEntradaT, setHoraEntradaT] = useState('');
  const [horaSalidaT, setHoraSalidaT] = useState('');
  const [horasTrabajadas, setHorasTrabajadas] = useState('');
  const [sesiones, setSesiones] = useState('0');
  const [valorHora, setValorHora] = useState('');
  const [valorSesion, setValorSesion] = useState('');
  const [obs, setObs] = useState('');
  const [guardandoAsist, setGuardandoAsist] = useState(false);

  // Estados para Modal/Formulario de ABM Auxiliar
  const [modalAuxiliarAbierto, setModalAuxiliarAbierto] = useState(false);
  const [auxiliarAEditar, setAuxiliarAEditar] = useState(null);
  const [nombreAux, setNombreAux] = useState('');
  const [tipoLiqAux, setTipoLiqAux] = useState('HORA');
  const [valorHoraAux, setValorHoraAux] = useState('');
  const [valorSesionAux, setValorSesionAux] = useState('');
  const [guardandoAux, setGuardandoAux] = useState(false);

  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
  const [filtroNombre, setFiltroNombre] = useState('');

  // Inicializar fecha
  useEffect(() => {
    const fSimulada = localStorage.getItem('crin_fecha_trabajo_simulada');
    setFechaTrabajo(fSimulada || new Date().toISOString().split('T')[0]);
  }, []);

  // Carga inicial y cada vez que cambia la fecha de trabajo
  useEffect(() => {
    if (fechaTrabajo) {
      cargarAuxiliares();
      cargarAsistenciasDia();
    }
  }, [fechaTrabajo]);

  useEffect(() => {
    if (pestañaActiva === 'historial') {
      cargarHistorial();
    }
  }, [pestañaActiva]);

  // Recalcular horas automáticamente al cambiar las entradas/salidas
  useEffect(() => {
    const calculada = calcularDiferenciaHoras(horaEntradaM, horaSalidaM, horaEntradaT, horaSalidaT);
    if (calculada) {
      setHorasTrabajadas(calculada);
    }
  }, [horaEntradaM, horaSalidaM, horaEntradaT, horaSalidaT]);

  const mostrarAlerta = (texto, tipo) => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
  };

  // Cargar auxiliares
  const cargarAuxiliares = async () => {
    setCargandoAuxiliares(true);
    try {
      const { data, error } = await supabase
        .from('auxiliares_motor')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;
      setAuxiliares(data || []);
    } catch (error) {
      console.error("Error al cargar auxiliares:", error);
      mostrarAlerta("Error al obtener auxiliares: " + error.message, "error");
    } finally {
      setCargandoAuxiliares(false);
    }
  };

  // Cargar asistencias del día seleccionado
  const cargarAsistenciasDia = async () => {
    setCargandoAsistencias(true);
    try {
      const { data, error } = await supabase
        .from('asistencia_auxiliares_motor')
        .select('*')
        .eq('fecha', fechaTrabajo);

      if (error) throw error;
      setAsistenciasDia(data || []);
    } catch (error) {
      console.error("Error al cargar asistencias del día:", error);
      mostrarAlerta("Error al cargar asistencias del día.", "error");
    } finally {
      setCargandoAsistencias(false);
    }
  };

  // Cargar historial completo
  const cargarHistorial = async () => {
    setCargandoHistorial(true);
    try {
      const { data, error } = await supabase
        .from('asistencia_auxiliares_motor')
        .select('*')
        .order('fecha', { ascending: false })
        .order('nombre', { ascending: true });

      if (error) throw error;
      setHistorialCompleto(data || []);
    } catch (error) {
      console.error("Error al cargar historial:", error);
      mostrarAlerta("Error al cargar historial.", "error");
    } finally {
      setCargandoHistorial(false);
    }
  };

  // Helper para calcular horas trabajadas
  const calcularDiferenciaHoras = (entM, salM, entT, salT) => {
    let minsTotal = 0;
    
    if (entM && salM) {
      const [hEnt, mEnt] = entM.split(':').map(Number);
      const [hSal, mSal] = salM.split(':').map(Number);
      if (!isNaN(hEnt) && !isNaN(hSal)) {
        const diff = (hSal * 60 + mSal) - (hEnt * 60 + mEnt);
        if (diff > 0) minsTotal += diff;
      }
    }
    
    if (entT && salT) {
      const [hEnt, mEnt] = entT.split(':').map(Number);
      const [hSal, mSal] = salT.split(':').map(Number);
      if (!isNaN(hEnt) && !isNaN(hSal)) {
        const diff = (hSal * 60 + mSal) - (hEnt * 60 + mEnt);
        if (diff > 0) minsTotal += diff;
      }
    }
    
    if (minsTotal <= 0) return '';
    const hs = Math.round((minsTotal / 60) * 100) / 100;
    return hs.toString();
  };

  // Abrir formulario para registrar/editar asistencia
  const abrirFormularioAsistencia = (auxiliar, registroExistente = null) => {
    setAuxiliarSeleccionadoAsist(auxiliar);
    setRegistroEdicion(registroExistente);

    if (registroExistente) {
      setTipoLiq(registroExistente.tipo_liq || 'HORA');
      setHoraEntradaM(registroExistente.hora_entrada_m ? registroExistente.hora_entrada_m.substring(0, 5) : '');
      setHoraSalidaM(registroExistente.hora_salida_m ? registroExistente.hora_salida_m.substring(0, 5) : '');
      setHoraEntradaT(registroExistente.hora_entrada_t ? registroExistente.hora_entrada_t.substring(0, 5) : '');
      setHoraSalidaT(registroExistente.hora_salida_t ? registroExistente.hora_salida_t.substring(0, 5) : '');
      setHorasTrabajadas(registroExistente.horas_trabajadas || '');
      setSesiones(registroExistente.sesiones ? String(registroExistente.sesiones) : '0');
      setValorHora(registroExistente.valor_hora ? String(registroExistente.valor_hora) : '');
      setValorSesion(registroExistente.valor_sesion ? String(registroExistente.valor_sesion) : '');
      setObs(registroExistente.obs || '');
    } else {
      setTipoLiq(auxiliar.tipo_liq || 'HORA');
      setHoraEntradaM('');
      setHoraSalidaM('');
      setHoraEntradaT('');
      setHoraSalidaT('');
      setHorasTrabajadas('');
      setSesiones('0');
      setValorHora(auxiliar.valor_hora ? String(auxiliar.valor_hora) : '');
      setValorSesion(auxiliar.valor_sesion ? String(auxiliar.valor_sesion) : '');
      setObs('');
    }

    setModalAsistenciaAbierto(true);
  };

  // Guardar asistencia en base de datos
  const guardarAsistencia = async () => {
    if (tipoLiq === 'HORA' && !horasTrabajadas) {
      alert("Por favor configure las horas trabajadas o ingrese los horarios.");
      return;
    }
    if (tipoLiq === 'SESION' && (isNaN(parsearDecimal(sesiones)) || parsearDecimal(sesiones) <= 0)) {
      alert("Por favor ingrese una cantidad válida de sesiones.");
      return;
    }

    setGuardandoAsist(true);
    try {
      let idRegInsert = null;

      if (registroEdicion) {
        idRegInsert = registroEdicion.id_registro;
      } else {
        // Consultar el próximo id_registro manual para evitar errores de secuencia
        const { data: maxRegData, error: errMaxReg } = await supabase
          .from('asistencia_auxiliares_motor')
          .select('id_registro')
          .order('id_registro', { ascending: false })
          .limit(1);

        if (errMaxReg) throw errMaxReg;
        idRegInsert = (maxRegData && maxRegData[0]?.id_registro ? maxRegData[0].id_registro : 0) + 1;
      }

      const registroInsert = {
        id_registro: idRegInsert,
        fecha: fechaTrabajo,
        id_auxiliar: auxiliarSeleccionadoAsist.id_auxiliar,
        nombre: auxiliarSeleccionadoAsist.nombre,
        tipo_liq: tipoLiq,
        hora_entrada_m: horaEntradaM || null,
        hora_salida_m: horaSalidaM || null,
        hora_entrada_t: horaEntradaT || null,
        hora_salida_t: horaSalidaT || null,
        horas_trabajadas: tipoLiq === 'HORA' ? horasTrabajadas : null,
        sesiones: tipoLiq === 'SESION' ? parsearDecimal(sesiones) : null,
        valor_hora: valorHora ? parsearDecimal(valorHora) : 0,
        valor_sesion: valorSesion ? parsearDecimal(valorSesion) : 0,
        obs: obs || null,
        fecha_registro: new Date().toISOString()
      };

      const { error } = await supabase
        .from('asistencia_auxiliares_motor')
        .upsert([registroInsert]);

      if (error) throw error;

      mostrarAlerta("Asistencia registrada exitosamente.", "exito");
      setModalAsistenciaAbierto(false);
      cargarAsistenciasDia();
    } catch (error) {
      console.error("Error al registrar asistencia:", error);
      alert("Error al registrar asistencia: " + error.message);
    } finally {
      setGuardandoAsist(false);
    }
  };

  // Eliminar un registro de asistencia
  const eliminarAsistencia = async (idRegistro) => {
    if (!window.confirm("¿Está seguro de que desea eliminar este registro de asistencia?")) return;

    try {
      const { error } = await supabase
        .from('asistencia_auxiliares_motor')
        .delete()
        .eq('id_registro', idRegistro);

      if (error) throw error;

      mostrarAlerta("Registro de asistencia eliminado.", "exito");
      cargarAsistenciasDia();
    } catch (error) {
      console.error("Error al eliminar asistencia:", error);
      alert("Error al eliminar asistencia: " + error.message);
    }
  };

  // Abrir modal de ABM Auxiliar
  const abrirFormularioAuxiliar = (aux = null) => {
    setAuxiliarAEditar(aux);
    if (aux) {
      setNombreAux(aux.nombre || '');
      setTipoLiqAux(aux.tipo_liq || 'HORA');
      setValorHoraAux(aux.valor_hora ? String(aux.valor_hora) : '');
      setValorSesionAux(aux.valor_sesion ? String(aux.valor_sesion) : '');
    } else {
      setNombreAux('');
      setTipoLiqAux('HORA');
      setValorHoraAux('');
      setValorSesionAux('');
    }
    setModalAuxiliarAbierto(true);
  };

  // Guardar auxiliar en auxiliares_motor
  const guardarAuxiliar = async () => {
    if (!nombreAux.trim()) {
      alert("Por favor ingrese el nombre del auxiliar.");
      return;
    }

    setGuardandoAux(true);
    try {
      let idAuxInsert = null;

      if (auxiliarAEditar) {
        idAuxInsert = auxiliarAEditar.id_auxiliar;
      } else {
        const { data: maxAuxData, error: errMaxAux } = await supabase
          .from('auxiliares_motor')
          .select('id_auxiliar')
          .order('id_auxiliar', { ascending: false })
          .limit(1);

        if (errMaxAux) throw errMaxAux;
        idAuxInsert = (maxAuxData && maxAuxData[0]?.id_auxiliar ? maxAuxData[0].id_auxiliar : 0) + 1;
      }

      const auxiliar = {
        id_auxiliar: idAuxInsert,
        nombre: nombreAux.toUpperCase(),
        tipo_liq: tipoLiqAux,
        valor_hora: tipoLiqAux === 'HORA' ? parsearDecimal(valorHoraAux) || 0 : null,
        valor_sesion: tipoLiqAux === 'SESION' ? parsearDecimal(valorSesionAux) || 0 : null,
        fecha_registro: new Date().toISOString()
      };

      const { error } = await supabase
        .from('auxiliares_motor')
        .upsert([auxiliar]);

      if (error) throw error;

      mostrarAlerta("Auxiliar guardado correctamente.", "exito");
      setModalAuxiliarAbierto(false);
      cargarAuxiliares();
    } catch (error) {
      console.error("Error al guardar auxiliar:", error);
      alert("Error al guardar auxiliar: " + error.message);
    } finally {
      setGuardandoAux(false);
    }
  };

  // Eliminar auxiliar de auxiliares_motor
  const eliminarAuxiliar = async (idAuxiliar) => {
    if (!window.confirm("¿Está seguro de que desea eliminar este auxiliar? Esto no borrará sus asistencias anteriores, pero ya no aparecerá en la planilla diaria.")) return;

    try {
      const { error } = await supabase
        .from('auxiliares_motor')
        .delete()
        .eq('id_auxiliar', idAuxiliar);

      if (error) throw error;

      mostrarAlerta("Auxiliar eliminado de la planilla.", "exito");
      cargarAuxiliares();
    } catch (error) {
      console.error("Error al eliminar auxiliar:", error);
      alert("Error al eliminar auxiliar: " + error.message);
    }
  };

  // Mapeo rápido de asistencias por id_auxiliar para la vista diaria
  const mapaAsistencias = {};
  asistenciasDia.forEach(a => {
    mapaAsistencias[a.id_auxiliar] = a;
  });

  return (
    <div style={{ background: '#ffffff', padding: '30px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', fontFamily: 'Segoe UI, system-ui, sans-serif', color: '#1e293b' }}>
      
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '18px', marginBottom: '25px' }}>
        <div>
          <h2 style={{ color: '#0f172a', margin: 0, fontSize: '22px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📋🤝 Asistencia de Auxiliares
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Registrá ingresos, salidas, horas y sesiones trabajadas del personal auxiliar.</p>
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

      {/* Tabs y Controles */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
          <button
            onClick={() => { setPestañaActiva('asistencia_diaria'); setFiltroNombre(''); }}
            style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', background: pestañaActiva === 'asistencia_diaria' ? '#fff' : 'transparent', color: pestañaActiva === 'asistencia_diaria' ? '#0f172a' : '#64748b', boxShadow: pestañaActiva === 'asistencia_diaria' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}
          >
            📅 Planilla Diaria
          </button>
          <button
            onClick={() => { setPestañaActiva('auxiliares'); setFiltroNombre(''); }}
            style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', background: pestañaActiva === 'auxiliares' ? '#fff' : 'transparent', color: pestañaActiva === 'auxiliares' ? '#0f172a' : '#64748b', boxShadow: pestañaActiva === 'auxiliares' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}
          >
            👥 Gestión de Auxiliares
          </button>
          <button
            onClick={() => { setPestañaActiva('historial'); setFiltroNombre(''); }}
            style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', background: pestañaActiva === 'historial' ? '#fff' : 'transparent', color: pestañaActiva === 'historial' ? '#0f172a' : '#64748b', boxShadow: pestañaActiva === 'historial' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}
          >
            📜 Historial General
          </button>
        </div>

        {pestañaActiva === 'asistencia_diaria' && (
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Fecha:</span>
              <input
                type="date"
                value={fechaTrabajo}
                onChange={(e) => setFechaTrabajo(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: '600' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>🔍 Filtrar Auxiliar:</span>
              <input
                type="text"
                placeholder="Escribe el nombre..."
                value={filtroNombre}
                onChange={(e) => setFiltroNombre(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', width: '180px', background: '#fff', color: '#1e293b' }}
              />
            </div>
            <button
              onClick={() => abrirFormularioAuxiliar()}
              style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.2s' }}
              onMouseOver={(e) => e.target.style.background = '#2563eb'}
              onMouseOut={(e) => e.target.style.background = '#3b82f6'}
            >
              ➕ Nuevo Auxiliar
            </button>
          </div>
        )}

        {pestañaActiva === 'auxiliares' && (
          <button
            onClick={() => abrirFormularioAuxiliar()}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ➕ Registrar Auxiliar Nuevo
          </button>
        )}

        {pestañaActiva === 'historial' && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>🔍 Filtrar por Auxiliar:</span>
            <input
              type="text"
              placeholder="Escribe el nombre..."
              value={filtroNombre}
              onChange={(e) => setFiltroNombre(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', width: '180px', background: '#fff', color: '#1e293b' }}
            />
          </div>
        )}
      </div>

      {/* ==================== VISTA 1: PLANILLA DIARIA ==================== */}
      {pestañaActiva === 'asistencia_diaria' && (
        <div>
          {cargandoAuxiliares || cargandoAsistencias ? (
            <p style={{ color: '#64748b', fontSize: '14px' }}>Cargando planilla diaria...</p>
          ) : auxiliares.length === 0 ? (
            <p style={{ color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '30px', borderRadius: '12px', textAlign: 'center' }}>
              No hay auxiliares registrados en la base de datos. Diríjase a la pestaña "Gestión de Auxiliares" para cargar personal.
            </p>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', background: '#fff' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: '12px 10px' }}>Auxiliar</th>
                    <th style={{ padding: '12px 10px' }}>Tipo Liq.</th>
                    <th style={{ padding: '12px 10px' }}>Mañana (Ent / Sal)</th>
                    <th style={{ padding: '12px 10px' }}>Tarde (Ent / Sal)</th>
                    <th style={{ padding: '12px 10px', textAlign: 'center' }}>Horas / Sesiones</th>
                    <th style={{ padding: '12px 10px' }}>Tarifa Activa</th>
                    <th style={{ padding: '12px 10px' }}>Observaciones</th>
                    <th style={{ padding: '12px 10px', textAlign: 'center' }}>Estado / Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {auxiliares
                    .filter(aux => (aux.nombre || '').toLowerCase().includes(filtroNombre.toLowerCase()))
                    .flatMap(aux => {
                      const asists = asistenciasDia.filter(a => a.id_auxiliar === aux.id_auxiliar);
                      if (asists.length === 0) {
                        return [{ aux, asist: null, showAddButton: true }];
                      } else {
                        return asists.map((asist, idx) => ({
                          aux,
                          asist,
                          showAddButton: idx === asists.length - 1
                        }));
                      }
                    })
                    .map(({ aux, asist, showAddButton }, idxFlat) => {
                      const rowKey = asist ? `asist-${asist.id_registro}` : `aux-${aux.id_auxiliar}`;
                      return (
                        <tr key={rowKey} style={{ borderBottom: '1px solid #e2e8f0', background: asist ? '#f0fdf4' : '#fff' }}>
                          <td style={{ padding: '12px 10px', fontWeight: 'bold', color: '#1e293b' }}>
                            👤 {aux.nombre}
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                              {asist ? asist.tipo_liq : aux.tipo_liq}
                            </span>
                          </td>
                          
                          {asist ? (
                            <>
                              <td style={{ padding: '12px 10px', color: '#334155' }}>
                                🌅 {asist.hora_entrada_m ? `${asist.hora_entrada_m.substring(0, 5)} a ${asist.hora_salida_m ? asist.hora_salida_m.substring(0, 5) : '?'}` : '-'}
                              </td>
                              <td style={{ padding: '12px 10px', color: '#334155' }}>
                                🌆 {asist.hora_entrada_t ? `${asist.hora_entrada_t.substring(0, 5)} a ${asist.hora_salida_t ? asist.hora_salida_t.substring(0, 5) : '?'}` : '-'}
                              </td>
                              <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 'bold', color: '#0f172a' }}>
                                {asist.tipo_liq === 'HORA' ? `⏱️ ${asist.horas_trabajadas || 0} hs` : `📑 ${asist.sesiones || 0} ses`}
                              </td>
                              <td style={{ padding: '12px 10px', fontWeight: '600', color: '#15803d' }}>
                                {asist.tipo_liq === 'HORA' ? `$${asist.valor_hora}/hs` : `$${asist.valor_sesion}/ses`}
                              </td>
                              <td style={{ padding: '12px 10px', color: '#64748b', fontStyle: asist.obs ? 'normal' : 'italic' }}>
                                {asist.obs || '-'}
                              </td>
                            </>
                          ) : (
                            <>
                              <td colSpan="5" style={{ padding: '12px 10px', color: '#94a3b8', fontStyle: 'italic' }}>
                                Ausente / Sin Registrar
                              </td>
                            </>
                          )}

                          <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                            {asist ? (
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                                <button
                                  onClick={() => abrirFormularioAsistencia(aux, asist)}
                                  style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => eliminarAsistencia(asist.id_registro)}
                                  style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                                >
                                  Quitar
                                </button>
                                {showAddButton && (
                                  <button
                                    onClick={() => abrirFormularioAsistencia(aux)}
                                    style={{ background: '#10b981', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                                    title="Registrar otro horario para este día"
                                  >
                                    ➕ Otro
                                  </button>
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={() => abrirFormularioAsistencia(aux)}
                                style={{ background: '#10b981', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                              >
                                ✍️ Presente
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================== VISTA 2: GESTION DE AUXILIARES ==================== */}
      {pestañaActiva === 'auxiliares' && (
        <div>
          {cargandoAuxiliares ? (
            <p style={{ color: '#64748b' }}>Cargando auxiliares...</p>
          ) : auxiliares.length === 0 ? (
            <p style={{ color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
              No hay auxiliares en la planilla. Use el botón superior para agregar personal auxiliar.
            </p>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', background: '#fff' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: '12px 10px' }}>ID Auxiliar</th>
                    <th style={{ padding: '12px 10px' }}>Nombre Completo</th>
                    <th style={{ padding: '12px 10px' }}>Liquidación Predeterminada</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Valor Hora Predet.</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Valor Sesión Predet.</th>
                    <th style={{ padding: '12px 10px', textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {auxiliares.map(aux => (
                    <tr key={aux.id_auxiliar} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '12px 10px', color: '#64748b' }}>
                        #{aux.id_auxiliar}
                      </td>
                      <td style={{ padding: '12px 10px', fontWeight: 'bold', color: '#1e293b' }}>
                        {aux.nombre}
                      </td>
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{ fontSize: '11px', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                          {aux.tipo_liq}
                        </span>
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: '600' }}>
                        {aux.valor_hora ? `$${parsearDecimal(aux.valor_hora).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: '600' }}>
                        {aux.valor_sesion ? `$${parsearDecimal(aux.valor_sesion).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            onClick={() => abrirFormularioAuxiliar(aux)}
                            style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => eliminarAuxiliar(aux.id_auxiliar)}
                            style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================== VISTA 3: HISTORIAL GENERAL ==================== */}
      {pestañaActiva === 'historial' && (
        <div>
          {cargandoHistorial ? (
            <p style={{ color: '#64748b' }}>Cargando historial...</p>
          ) : historialCompleto.length === 0 ? (
            <p style={{ color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
              No se registran asistencias en el historial.
            </p>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', background: '#fff' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: '12px 10px' }}>Fecha</th>
                    <th style={{ padding: '12px 10px' }}>Auxiliar</th>
                    <th style={{ padding: '12px 10px' }}>Tipo Liq.</th>
                    <th style={{ padding: '12px 10px' }}>Mañana</th>
                    <th style={{ padding: '12px 10px' }}>Tarde</th>
                    <th style={{ padding: '12px 10px', textAlign: 'center' }}>Horas / Sesiones</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Tarifa</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Total Devengado</th>
                    <th style={{ padding: '12px 10px' }}>Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {historialCompleto
                    .filter(reg => (reg.nombre || '').toLowerCase().includes(filtroNombre.toLowerCase()))
                    .map(reg => {
                      const tarifa = reg.tipo_liq === 'HORA' ? parsearDecimal(reg.valor_hora) || 0 : parsearDecimal(reg.valor_sesion) || 0;
                      const cantidad = reg.tipo_liq === 'HORA' ? parsearDecimal(reg.horas_trabajadas) || 0 : parsearDecimal(reg.sesiones) || 0;
                      const totalDevengado = tarifa * cantidad;

                    return (
                      <tr key={reg.id_registro} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '12px 10px', whiteSpace: 'nowrap', fontWeight: '500', color: '#475569' }}>
                          📅 {new Date(reg.fecha + 'T00:00:00').toLocaleDateString('es-AR')}
                        </td>
                        <td style={{ padding: '12px 10px', fontWeight: 'bold', color: '#1e293b' }}>
                          {reg.nombre}
                        </td>
                        <td style={{ padding: '12px 10px' }}>
                          <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                            {reg.tipo_liq}
                          </span>
                        </td>
                        <td style={{ padding: '12px 10px', color: '#475569' }}>
                          {reg.hora_entrada_m ? `${reg.hora_entrada_m.substring(0, 5)} a ${reg.hora_salida_m ? reg.hora_salida_m.substring(0, 5) : '?'}` : '-'}
                        </td>
                        <td style={{ padding: '12px 10px', color: '#475569' }}>
                          {reg.hora_entrada_t ? `${reg.hora_entrada_t.substring(0, 5)} a ${reg.hora_salida_t ? reg.hora_salida_t.substring(0, 5) : '?'}` : '-'}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: '600' }}>
                          {reg.tipo_liq === 'HORA' ? `${reg.horas_trabajadas || 0} hs` : `${reg.sesiones || 0} ses`}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', color: '#64748b' }}>
                          ${tarifa.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold', color: '#15803d' }}>
                          ${totalDevengado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px 10px', color: '#64748b' }}>
                          {reg.obs || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================== MODAL 1: REGISTRAR/EDITAR ASISTENCIA ==================== */}
      {modalAsistenciaAbierto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '25px', borderRadius: '12px', width: '90%', maxWidth: '550px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: 'bold' }}>
                📝 Registro de Asistencia: {auxiliarSeleccionadoAsist?.nombre}
              </h3>
              <button onClick={() => setModalAsistenciaAbierto(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Fecha Planilla</label>
                <input type="text" value={fechaTrabajo} disabled style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#f1f5f9', color: '#64748b', fontSize: '13px' }} />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Tipo de Liquidación</label>
                <select
                  value={tipoLiq}
                  onChange={(e) => setTipoLiq(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
                >
                  <option value="HORA">Por Horas Trabajadas (HORA)</option>
                  <option value="SESION">Por Sesiones Realizadas (SESION)</option>
                </select>
              </div>
            </div>

            {tipoLiq === 'HORA' ? (
              <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '15px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#1e3a8a' }}>🌅 Horarios Turno Mañana</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Entrada Mañana</label>
                    <input type="time" value={horaEntradaM} onChange={(e) => setHoraEntradaM(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Salida Mañana</label>
                    <input type="time" value={horaSalidaM} onChange={(e) => setHoraSalidaM(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                </div>

                <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#1e3a8a' }}>🌆 Horarios Turno Tarde</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Entrada Tarde</label>
                    <input type="time" value={horaEntradaT} onChange={(e) => setHoraEntradaT(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Salida Tarde</label>
                    <input type="time" value={horaSalidaT} onChange={(e) => setHoraSalidaT(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#0f172a', marginBottom: '4px' }}>Total Horas Trabajadas</label>
                    <input type="text" value={horasTrabajadas} onChange={(e) => setHorasTrabajadas(e.target.value)} placeholder="Ej: 8.5" style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 'bold', background: '#fff' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Valor Tarifa Hora ($)</label>
                    <input type="number" value={valorHora} onChange={(e) => setValorHora(e.target.value)} placeholder="0.00" style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '15px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#1e3a8a' }}>📑 Carga por Sesiones</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#0f172a', marginBottom: '4px' }}>Cantidad de Sesiones</label>
                    <input type="number" value={sesiones} onChange={(e) => setSesiones(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 'bold' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Valor Tarifa Sesión ($)</label>
                    <input type="number" value={valorSesion} onChange={(e) => setValorSesion(e.target.value)} placeholder="0.00" style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Observaciones del Día</label>
              <textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Notas o aclaraciones adicionales..."
                rows="2"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setModalAsistenciaAbierto(false)}
                disabled={guardandoAsist}
                style={{ padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                Cancelar
              </button>
              <button
                onClick={guardarAsistencia}
                disabled={guardandoAsist}
                style={{ padding: '8px 20px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                {guardandoAsist ? 'Guardando...' : 'Confirmar Asistencia'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL 2: ABM AUXILIAR MASTER ==================== */}
      {modalAuxiliarAbierto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '25px', borderRadius: '12px', width: '90%', maxWidth: '500px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: 'bold' }}>
                👤 {auxiliarAEditar ? 'Editar Auxiliar' : 'Agregar Auxiliar Nuevo'}
              </h3>
              <button onClick={() => setModalAuxiliarAbierto(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Nombre Completo *</label>
              <input
                type="text"
                value={nombreAux}
                onChange={(e) => setNombreAux(e.target.value)}
                placeholder="Ej: LOPEZ JUAN CARLOS"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Tipo de Liquidación Predeterminada</label>
              <select
                value={tipoLiqAux}
                onChange={(e) => setTipoLiqAux(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
              >
                <option value="HORA">Por Horas Trabajadas (HORA)</option>
                <option value="SESION">Por Sesiones Realizadas (SESION)</option>
              </select>
            </div>

            {tipoLiqAux === 'HORA' ? (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Valor Hora Predeterminado ($)</label>
                <input
                  type="number"
                  value={valorHoraAux}
                  onChange={(e) => setValorHoraAux(e.target.value)}
                  placeholder="Ej: 3200"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>
            ) : (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Valor Sesión Predeterminado ($)</label>
                <input
                  type="number"
                  value={valorSesionAux}
                  onChange={(e) => setValorSesionAux(e.target.value)}
                  placeholder="Ej: 3500"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setModalAuxiliarAbierto(false)}
                disabled={guardandoAux}
                style={{ padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                Cancelar
              </button>
              <button
                onClick={guardarAuxiliar}
                disabled={guardandoAux}
                style={{ padding: '8px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                {guardandoAux ? 'Guardando...' : 'Guardar Auxiliar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
