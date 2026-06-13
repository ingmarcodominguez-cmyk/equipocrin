import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function Tasks({ userData, playNotification }) {
  const [tasks, setTasks] = useState([])
  const [descripcion, setDescripcion] = useState('')
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [asignados, setAsignados] = useState([])
  const [users, setUsers] = useState([])
  const [respuestas, setRespuestas] = useState({})
  
  const [usuarioFiltro, setUsuarioFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');

  const esAdmin = ['ADMINISTRACION', 'DIRECCION'].includes(userData?.rol?.toUpperCase());

  useEffect(() => {
    if (!userData?.id) return;
    cargarTasks();
    cargarUsuarios();
    
    const channel = supabase
      .channel('tasks_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        if (payload.eventType === 'INSERT' && String(payload.new.asignado_a) === String(userData.id)) {
          playNotification();
        }
        cargarTasks();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userData?.id, userData?.rol, usuarioFiltro, estadoFiltro]);

  async function cargarTasks() {
    if (!userData?.id) return;
    let query = supabase.from('tasks').select('*').order('created_at', { ascending: false });

    if (estadoFiltro) { query = query.eq('estado', estadoFiltro); }

    if (esAdmin) {
      if (usuarioFiltro) {
        query = query.or(`creado_por.eq.${usuarioFiltro},asignado_a.eq.${usuarioFiltro}`);
      }
    } else {
      query = query.or(`creado_por.eq.${userData.id},asignado_a.eq.${userData.id}`);
    }

    const { data } = await query;
    if (data) setTasks(data);
  }

  async function cargarUsuarios() {
    const { data } = await supabase.from('users').select('id, nombre, telefono');
    if (data) setUsers(data);
  }

  async function crearTask() {
    if (!descripcion || asignados.length === 0 || !fechaVencimiento) return alert("Completa todos los campos");
    const nuevasTareas = asignados.map(userId => ({ 
      descripcion, asignado_a: userId, fecha_vencimiento: fechaVencimiento, estado: 'pendiente', creado_por: userData?.id 
    }));
    const { error } = await supabase.from('tasks').insert(nuevasTareas);
    if (!error) { setDescripcion(''); setFechaVencimiento(''); setAsignados([]); cargarTasks(); }
  }

  const toggleAsignado = (userId) => { setAsignados(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]); };

  async function responderTask(id) {
    if (!respuestas[id]) return;
    await supabase.from('tasks').update({ respuesta: respuestas[id], estado: 'completada' }).eq('id', id);
    setRespuestas({ ...respuestas, [id]: '' });
    cargarTasks();
  }

  function nombreUsuario(id) {
    const u = users.find((user) => String(user.id) === String(id));
    return u ? u.nombre : 'Usuario';
  }

  return (
    <div style={{ color: '#fff', padding: '10px' }}>
      <h2 style={{ color: '#00f2ff' }}>Gestión de Tareas</h2>
      
      {esAdmin && (
        <div style={{ background: '#111', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #333' }}>
          <h4 style={{ margin: '0 0 10px 0' }}>Filtros</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <select value={usuarioFiltro} onChange={(e) => setUsuarioFiltro(e.target.value)} style={inputStyle}>
              <option value="">👤 Todos</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
            <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} style={inputStyle}>
              <option value="">📋 Todos los estados</option>
              <option value="pendiente">⏳ Pendientes</option>
              <option value="completada">✅ Finalizadas</option>
            </select>
          </div>
        </div>
      )}

      <div style={formStyle}>
        <h3>Nueva Tarea</h3>
        <textarea placeholder="Descripción..." value={descripcion} onChange={(e) => setDescripcion(e.target.value)} style={inputStyle} />
        <div style={{ margin: '10px 0', padding: '10px', background: '#000', borderRadius: '8px', maxHeight: '100px', overflowY: 'auto' }}>
          {users.map(u => (
            <label key={u.id} style={{ display: 'block', fontSize: '0.9rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={asignados.includes(String(u.id))} onChange={() => toggleAsignado(String(u.id))} /> {u.nombre}
            </label>
          ))}
        </div>
        <input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} style={inputStyle} />
        <button onClick={crearTask} style={btnEnviarStyle}>CREAR TAREA</button>
      </div>

      <div style={{ display: 'grid', gap: '20px' }}>
        {tasks.map((t) => (
          <div key={t.id} style={cardStyle}>
            <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '10px', borderBottom: '1px solid #333', paddingBottom: '5px' }}>
              👤 De: {nombreUsuario(t.creado_por)} ➡️ Para: {nombreUsuario(t.asignado_a)}
            </div>
            
            <p style={{ margin: '10px 0', fontSize: '1.1rem' }}>{t.descripcion}</p>
            
            {t.estado === 'completada' ? (
              <div style={{ background: '#1a1a1a', padding: '10px', borderRadius: '5px', borderLeft: '3px solid #00ff9d' }}>
                <span style={{ fontSize: '0.7rem', color: '#00ff9d' }}>RESPUESTA:</span>
                <p style={{ margin: '5px 0 0 0' }}>{t.respuesta}</p>
              </div>
            ) : (
              String(userData?.id) === String(t.asignado_a) && (
                <div style={{ marginTop: 15 }}>
                  <textarea placeholder="Tu respuesta..." value={respuestas[t.id] || ''} onChange={(e) => setRespuestas({...respuestas, [t.id]: e.target.value})} style={inputStyle} />
                  <button onClick={() => responderTask(t.id)} style={btnEnviarStyle}>ENVIAR RESPUESTA</button>
                </div>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const cardStyle = { background: '#0a0a0a', border: '1px solid #333', borderRadius: '15px', padding: '20px' };
const formStyle = { background: '#111', border: '1px solid #333', padding: '20px', borderRadius: '15px', marginBottom: '30px' };
const inputStyle = { width: '100%', background: '#000', border: '1px solid #444', color: '#fff', padding: '10px', borderRadius: '8px', marginBottom: '10px', boxSizing: 'border-box' };
const btnEnviarStyle = { width: '100%', padding: '10px', background: 'transparent', border: '1px solid #00f2ff', color: '#00f2ff', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' };

export default Tasks;