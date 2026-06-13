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

  const rol = userData?.rol?.toUpperCase() || "";
  const esAdmin = ['ADMINISTRACION', 'DIRECCION'].includes(rol);

  // Lógica: Vence al día siguiente. Si hoy es > fecha, está vencida.
  const esVencida = (fecha, estado) => {
    if (estado === 'completada' || !fecha) return false;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const vencimiento = new Date(fecha);
    vencimiento.setHours(0, 0, 0, 0);
    return hoy > vencimiento;
  };

  // Función para enviar WhatsApp
  const enviarWhatsApp = (tarea, usuarioAsignado) => {
    const telefono = usuarioAsignado?.telefono || '';
    if (!telefono) return alert("Este usuario no tiene teléfono cargado");
    const mensaje = `Hola ${usuarioAsignado.nombre}, te recuerdo la tarea: "${tarea.descripcion}". Fecha de vencimiento: ${tarea.fecha_vencimiento}`;
    window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`, '_blank');
  };

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
  }, [userData?.id, rol, usuarioFiltro, estadoFiltro]);

  async function cargarTasks() {
    if (!userData?.id) return;
    let query = supabase.from('tasks').select('*').order('created_at', { ascending: false });

    if (esAdmin) {
      if (usuarioFiltro) {
        query = query.or(`creado_por.eq.${usuarioFiltro},asignado_a.eq.${usuarioFiltro}`);
      }
    } else {
      query = query.or(`creado_por.eq.${userData.id},asignado_a.eq.${userData.id}`);
    }

    const { data } = await query;
    if (data) {
      let filtradas = data;
      if (estadoFiltro === 'pendiente') filtradas = data.filter(t => t.estado === 'pendiente' && !esVencida(t.fecha_vencimiento, t.estado));
      if (estadoFiltro === 'completada') filtradas = data.filter(t => t.estado === 'completada');
      if (estadoFiltro === 'vencida') filtradas = data.filter(t => esVencida(t.fecha_vencimiento, t.estado));
      setTasks(filtradas);
    }
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

  function getUsuario(id) {
    return users.find((user) => String(user.id) === String(id));
  }

  return (
    <div style={{ color: '#fff', padding: '10px' }}>
      <h2 style={{ color: '#00f2ff' }}>Gestión de Tareas</h2>
      
      <div style={{ background: '#111', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #333' }}>
        <h4 style={{ margin: '0 0 10px 0' }}>Filtros</h4>
        <div style={{ display: 'grid', gridTemplateColumns: esAdmin ? '1fr 1fr' : '1fr', gap: '10px' }}>
          {esAdmin && (
            <select value={usuarioFiltro} onChange={(e) => setUsuarioFiltro(e.target.value)} style={inputStyle}>
              <option value="">👤 Todos los usuarios</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          )}
          <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} style={inputStyle}>
            <option value="">📋 Todos los estados</option>
            <option value="pendiente">⏳ Pendientes</option>
            <option value="vencida">⚠️ Vencidas</option>
            <option value="completada">✅ Finalizadas</option>
          </select>
        </div>
      </div>

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
        <div style={{ marginBottom: '10px' }}>
          <label style={{ fontStyle: 'italic', color: '#aaa', fontSize: '0.85rem' }}>Fecha de vencimiento:</label>
          <input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} style={inputStyle} />
        </div>
        <button onClick={crearTask} style={btnEnviarStyle}>CREAR TAREA</button>
      </div>

      <div style={{ display: 'grid', gap: '20px' }}>
        {tasks.map((t) => {
          const vencida = esVencida(t.fecha_vencimiento, t.estado);
          const usuarioAsignado = getUsuario(t.asignado_a);
          return (
            <div key={t.id} style={{ ...cardStyle, borderColor: vencida ? '#ff4444' : '#333' }}>
              <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '10px', borderBottom: '1px solid #333', paddingBottom: '5px' }}>
                👤 De: {getUsuario(t.creado_por)?.nombre || 'Admin'} ➡️ Para: {usuarioAsignado?.nombre || 'Usuario'}
                <button onClick={() => enviarWhatsApp(t, usuarioAsignado)} style={{ marginLeft: '10px', background: 'none', border: 'none', color: '#25D366', cursor: 'pointer', fontSize: '0.9rem' }}>
                  📱 WhatsApp
                </button>
                <span style={{ float: 'right', color: vencida ? '#ff4444' : '#fff' }}>{vencida ? '⚠️ VENCIDA' : `📅 ${t.fecha_vencimiento}`}</span>
              </div>
              <p style={{ margin: '10px 0', fontSize: '1.1rem' }}>{t.descripcion}</p>
              {t.estado === 'completada' ? (
                <div style={{ background: '#1a1a1a', padding: '10px', borderRadius: '5px', borderLeft: '3px solid #00ff9d' }}><p style={{ margin: 0 }}>{t.respuesta}</p></div>
              ) : (
                String(userData?.id) === String(t.asignado_a) && (
                  <div>
                    <textarea placeholder="Tu respuesta..." value={respuestas[t.id] || ''} onChange={(e) => setRespuestas({...respuestas, [t.id]: e.target.value})} style={inputStyle} />
                    <button onClick={() => responderTask(t.id)} style={btnEnviarStyle}>ENVIAR RESPUESTA</button>
                  </div>
                )
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const cardStyle = { background: '#0a0a0a', border: '1px solid #333', borderRadius: '15px', padding: '20px' };
const formStyle = { background: '#111', border: '1px solid #333', padding: '20px', borderRadius: '15px', marginBottom: '30px' };
const inputStyle = { width: '100%', background: '#000', border: '1px solid #444', color: '#fff', padding: '10px', borderRadius: '8px', marginBottom: '10px', boxSizing: 'border-box' };
const btnEnviarStyle = { width: '100%', padding: '10px', background: 'transparent', border: '1px solid #00f2ff', color: '#00f2ff', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' };

export default Tasks;