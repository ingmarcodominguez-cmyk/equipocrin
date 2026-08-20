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

      // Construir mapa de UUID -> INT paciente
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
        }
      });

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
      prev.map(p => p.id_paciente === idPaciente ? { ...p, estado: nuevoEstado } : p)
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
