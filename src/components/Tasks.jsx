import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function Tasks({ userData }) {
  const [tasks, setTasks] = useState([])
  const [descripcion, setDescripcion] = useState('')
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [asignado, setAsignado] = useState('')
  const [users, setUsers] = useState([])
  const [respuestas, setRespuestas] = useState({})
  const [sonidoActivado, setSonidoActivado] = useState(false);

  // 1. Notificaciones y Alertas
  const activarNotificaciones = () => {
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }
    setSonidoActivado(true);
    alert("Notificaciones activadas");
  };

  const dispararAlerta = () => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("¡Nueva Tarea!", { body: "Tenés una tarea nueva pendiente." });
    }
    const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
    audio.play().catch(e => console.log("Sonido bloqueado"));
    if ("vibrate" in navigator) navigator.vibrate([1000, 1000, 1000]);
  };

  // 2. Efectos y Carga en Tiempo Real
  useEffect(() => {
    if (!userData?.id) return
    cargarTasks()
    cargarUsuarios()
    
    // Escucha cualquier cambio (INSERT o UPDATE) para mantener todo al día
    const channel = supabase
      .channel('tasks_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        // Si entra una tarea nueva, suena; si es una respuesta, solo actualizamos
        if (payload.eventType === 'INSERT') {
          dispararAlerta();
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

  // 3. Acciones de Tareas
  async function crearTask() {
    if (!descripcion || !asignado || !fechaVencimiento) {
      alert("⚠️ Por favor, completá todos los campos antes de enviar.");
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
      alert("❌ Error al crear: " + error.message);
    } else {
      alert("✅ Tarea enviada exitosamente.");
      setDescripcion(''); 
      setFechaVencimiento('');
      setAsignado('');
      cargarTasks();
    }
  }

  async function responderTask(id) {
    if (!respuestas[id]) {
      alert("⚠️ Debes escribir una respuesta.");
      return;
    }
    
    const { error } = await supabase.from('tasks').update({ 
      respuesta: respuestas[id], 
      estado: 'completada' 
    }).eq('id', id)
    
    if (error) {
      alert("❌ Error al enviar la respuesta.");
    } else {
      setRespuestas({ ...respuestas, [id]: '' });
      cargarTasks();
    }
  }

  function nombreUsuario(id) {
    const u = users.find((user) => String(user.id) === String(id))
    return u ? u.nombre : 'Usuario'
  }

  // 4. Renderizado
  return (
    <div>
      {!sonidoActivado && (
        <button onClick={activarNotificaciones} style={{ width: '100%', padding: 20, background: 'red', color: 'white', marginBottom: '15px' }}>
          TOCÁ AQUÍ PARA ACTIVAR NOTIFICACIONES
        </button>
      )}
      
      <h1>Mis Tareas</h1>
      
      <div style={{ border: '2px solid #007bff', padding: 20, marginBottom: 30, borderRadius: 12, backgroundColor: '#f8f9fa' }}>
        <h3>Nueva Tarea</h3>
        <label>Tarea pedida:</label>
        <textarea placeholder="Describe la tarea..." value={descripcion} onChange={(e) => setDescripcion(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        
        <label>Asignado a:</label>
        <select onChange={(e) => setAsignado(e.target.value)} value={asignado} style={{ width: '100%', marginBottom: 10 }}>
          <option value="">Selecciona un usuario...</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
        
        <label>Fecha de vencimiento:</label>
        <input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} style={{ width: '100%', marginBottom: 15 }} />
        
        <button onClick={crearTask} style={{ width: '100%', padding: 12, background: '#007bff', color: 'white', border: 'none', borderRadius: 6, fontWeight: 'bold' }}>
          ENVIAR TAREA
        </button>
      </div>

      {tasks.map((t) => {
        const esCreador = String(userData?.id) === String(t.creado_por);
        const esAsignado = String(userData?.id) === String(t.asignado_a);

        return (
          <div key={t.id} style={{ border: '1px solid #ccc', padding: 15, margin: 10, borderRadius: 10, backgroundColor: t.estado === 'completada' ? '#f0fdf4' : '#fff' }}>
            <p><strong>De:</strong> {nombreUsuario(t.creado_por)} <strong>Para:</strong> {nombreUsuario(t.asignado_a)}</p>
            <p><strong>Tarea:</strong> {t.descripcion}</p>
            {t.fecha_vencimiento && <p style={{ fontSize: '0.8rem', color: '#d9534f' }}><strong>Vence:</strong> {t.fecha_vencimiento}</p>}
            
            {t.estado === 'completada' && (
              <p style={{ color: 'blue' }}><strong>Respuesta:</strong> {t.respuesta}</p>
            )}

            {t.estado !== 'completada' && (
              <>
                {esCreador && <p style={{ fontStyle: 'italic', color: '#666' }}>Esperando respuesta...</p>}
                {esAsignado && (
                  <div style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 10 }}>
                    <textarea placeholder="Tu respuesta aquí..." onChange={(e) => setRespuestas({...respuestas, [t.id]: e.target.value})} style={{ width: '100%' }} />
                    <button onClick={() => responderTask(t.id)} style={{ width: '100%', marginTop: 5 }}>Enviar Respuesta</button>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
export default Tasks