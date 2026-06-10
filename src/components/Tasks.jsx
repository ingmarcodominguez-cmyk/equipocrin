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
    alert("Notificaciones activadas");
  };

  useEffect(() => {
    if (!userData?.id) return
    cargarTasks()
    cargarUsuarios()
    
    const channel = supabase
      .channel('tasks_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          playNotification();
        }
        cargarTasks();
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel) }
  }, [userData])

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
    if (!descripcion || !asignado || !fechaVencimiento) {
      alert("⚠️ Por favor, completá todos los campos.");
      return;
    }

    const { error } = await supabase.from('tasks').insert([{ 
      descripcion, 
      asignado_a: asignado, 
      fecha_vencimiento: fechaVencimiento,
      estado: 'pendiente', 
      creado_por: userData?.id 
    }])

    if (error) {
      alert("❌ Error: " + error.message);
    } else {
      setDescripcion(''); 
      setFechaVencimiento('');
      setAsignado('');
      cargarTasks();
    }
  }

  async function responderTask(id) {
    if (!respuestas[id]) return;
    const { error } = await supabase.from('tasks').update({ 
      respuesta: respuestas[id], 
      estado: 'completada' 
    }).eq('id', id)
    
    if (error) alert("Error al enviar.");
    else {
      setRespuestas({ ...respuestas, [id]: '' });
      cargarTasks();
    }
  }

  function nombreUsuario(id) {
    const u = users.find((user) => String(user.id) === String(id))
    return u ? u.nombre : 'Usuario'
  }

  return (
    <div style={{ width: '100%', maxWidth: '100%' }}>
      {!sonidoActivado && (
        <button onClick={activarNotificaciones} style={{ width: '100%', padding: 15, background: '#ef4444', color: 'white', border: 'none', borderRadius: 8, marginBottom: 15 }}>
          🔔 ACTIVAR NOTIFICACIONES
        </button>
      )}
      
      <h1>Mis Tareas</h1>
      
      {/* FORMULARIO MEJORADO */}
      <div style={{ border: '2px solid #007bff', padding: 20, marginBottom: 30, borderRadius: 12, backgroundColor: '#f8f9fa' }}>
        <h3>Nueva Tarea</h3>
        
        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Descripción:</label>
        <textarea placeholder="Describe la tarea..." value={descripcion} onChange={(e) => setDescripcion(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: 10, borderRadius: 4 }} />
        
        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Asignado a:</label>
        <select onChange={(e) => setAsignado(e.target.value)} value={asignado} style={{ width: '100%', padding: '10px', marginBottom: 10, borderRadius: 4 }}>
          <option value="">Selecciona un usuario...</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
        
        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>📅 Fecha de vencimiento:</label>
        <input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: 15, borderRadius: 4 }} />
        
        <button onClick={crearTask} style={{ width: '100%', padding: 15, background: '#007bff', color: 'white', border: 'none', borderRadius: 6, fontWeight: 'bold' }}>
          ENVIAR TAREA
        </button>
      </div>

      {/* LISTADO */}
      {tasks.map((t) => {
        const esCreador = String(userData?.id) === String(t.creado_por);
        const esAsignado = String(userData?.id) === String(t.asignado_a);

        return (
          <div key={t.id} style={{ border: '1px solid #ccc', padding: 15, margin: '10px 0', borderRadius: 10, backgroundColor: t.estado === 'completada' ? '#f0fdf4' : '#fff' }}>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              <strong>De:</strong> {nombreUsuario(t.creado_por)} | <strong>Para:</strong> {nombreUsuario(t.asignado_a)}
            </p>
            <p style={{ margin: '10px 0', fontSize: '1.1rem' }}><strong>Tarea:</strong> {t.descripcion}</p>
            <p style={{ fontSize: '0.8rem', color: '#d9534f' }}><strong>Vence:</strong> {t.fecha_vencimiento}</p>
            
            {t.estado === 'completada' && (
              <p style={{ color: 'blue', marginTop: 10 }}><strong>Respuesta:</strong> {t.respuesta}</p>
            )}

            {t.estado !== 'completada' && esAsignado && (
              <div style={{ marginTop: 10 }}>
                <textarea placeholder="Tu respuesta..." onChange={(e) => setRespuestas({...respuestas, [t.id]: e.target.value})} style={{ width: '100%', padding: 8 }} />
                <button onClick={() => responderTask(t.id)} style={{ width: '100%', marginTop: 5, padding: 10 }}>Enviar Respuesta</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
export default Tasks