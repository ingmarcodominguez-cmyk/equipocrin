import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function Tasks({ userData, playNotification }) {
  const [tasks, setTasks] = useState([])
  const [descripcion, setDescripcion] = useState('')
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [asignado, setAsignado] = useState('')
  const [users, setUsers] = useState([])
  const [respuestas, setRespuestas] = useState({})
  const [sonidoActivado, setSonidoActivado] = useState(false);

  const activarNotificaciones = () => {
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }
    setSonidoActivado(true);
  };

  useEffect(() => {
    if (!userData?.id) return
    cargarTasks()
    cargarUsuarios()
    
    const channel = supabase
      .channel('tasks_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        if (payload.eventType === 'INSERT') playNotification();
        cargarTasks();
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel) }
  }, [userData?.id]) // Ajustado para evitar ejecuciones en bucle

  async function cargarTasks() {
    if (!userData?.id) return
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .or(`creado_por.eq.${userData.id},asignado_a.eq.${userData.id}`)
      .order('created_at', { ascending: false })
      
    if (data) setTasks(data)
  }

  async function cargarUsuarios() {
    const { data } = await supabase.from('users').select('*')
    if (data) setUsers(data)
  }

  async function crearTask() {
    if (!descripcion || !asignado || !fechaVencimiento) return alert("Completa todos los campos");
    const { error } = await supabase.from('tasks').insert([{ 
      descripcion, asignado_a: asignado, fecha_vencimiento: fechaVencimiento, estado: 'pendiente', creado_por: userData?.id 
    }])
    if (!error) {
      setDescripcion(''); setFechaVencimiento(''); setAsignado('');
      // No llamamos a cargarTasks manual aquí; dejamos que actúe el canal en tiempo real
    }
  }

  async function responderTask(id) {
    if (!respuestas[id]) return;
    const { error } = await supabase.from('tasks').update({ respuesta: respuestas[id], estado: 'completada' }).eq('id', id)
    if (!error) {
      setRespuestas({ ...respuestas, [id]: '' });
      // No llamamos a cargarTasks manual aquí; dejamos que actúe el canal en tiempo real
    }
  }

  function nombreUsuario(id) {
    const u = users.find((user) => String(user.id) === String(id))
    return u ? u.nombre : 'Usuario'
  }

  return (
    <div style={{ color: '#fff' }}>
      {!sonidoActivado && (
        <button onClick={activarNotificaciones} style={btnNotifStyle}>🔔 ACTIVAR NOTIFICACIONES</button>
      )}
      
      <h2 style={{ color: '#00f2ff', marginBottom: '20px' }}>Gestión de Tareas</h2>
      
      {/* FORMULARIO */}
      <div style={formStyle}>
        <h3 style={{ marginTop: 0 }}>Nueva Tarea</h3>
        <textarea placeholder="Descripción..." value={descripcion} onChange={(e) => setDescripcion(e.target.value)} style={inputStyle} />
        <select onChange={(e) => setAsignado(e.target.value)} value={asignado} style={inputStyle}>
          <option value="">Asignar a...</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
        <input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} style={inputStyle} />
        <button onClick={crearTask} style={btnEnviarStyle}>ENVIAR TAREA</button>
      </div>

      {/* LISTADO */}
      <div style={{ display: 'grid', gap: '20px' }}>
        {tasks.map((t) => (
          <div key={t.id} style={cardStyle}>
            <div style={{ borderBottom: '1px solid #333', paddingBottom: '10px', marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#888' }}>
                <span>👤 De: {nombreUsuario(t.creado_por)}</span>
                <span>➡️ Para: {nombreUsuario(t.asignado_a)}</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#ff4444', marginTop: '5px' }}>📅 Vence: {t.fecha_vencimiento}</div>
            </div>
            
            <p style={{ margin: '15px 0', fontSize: '1rem', color: '#eee' }}>{t.descripcion}</p>
            
            {t.estado === 'completada' ? (
              <div style={{ background: '#1a1a1a', padding: '10px', borderRadius: '8px', borderLeft: '3px solid #00ff9d' }}>
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

// Estilos
const cardStyle = { background: '#0a0a0a', border: '1px solid #333', borderRadius: '15px', padding: '20px' };
const formStyle = { background: '#111', border: '1px solid #333', padding: '20px', borderRadius: '15px', marginBottom: '30px' };
const inputStyle = { width: '100%', background: '#000', border: '1px solid #444', color: '#fff', padding: '12px', borderRadius: '8px', marginBottom: '10px', fontFamily: 'inherit' };
const btnEnviarStyle = { width: '100%', padding: '12px', background: 'transparent', border: '1px solid #00f2ff', color: '#00f2ff', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' };
const btnNotifStyle = { width: '100%', padding: '10px', background: '#ff4444', color: '#fff', border: 'none', borderRadius: '8px', marginBottom: '20px', cursor: 'pointer' };

export default Tasks;