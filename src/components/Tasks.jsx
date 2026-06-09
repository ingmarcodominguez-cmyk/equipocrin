import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function Tasks({ userData }) {
  const [tasks, setTasks] = useState([])
  const [descripcion, setDescripcion] = useState('')
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

  const dispararAlerta = () => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("¡Nueva Tarea!", { body: "Tenés una tarea nueva pendiente." });
    }
    const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
    audio.play().catch(e => console.log("Sonido bloqueado"));
    if ("vibrate" in navigator) navigator.vibrate([1000, 1000, 1000]);
  };

  useEffect(() => {
    if (!userData?.id) return
    cargarTasks()
    cargarUsuarios()
    const channel = supabase
      .channel('tasks_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, () => {
        dispararAlerta();
        cargarTasks();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel) }
  }, [userData])

  async function cargarTasks() {
    if (!userData?.id) return
    // FILTRO: Solo trae las que yo creé o las que me asignaron
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
    if (!descripcion) return
    await supabase.from('tasks').insert([{ 
      descripcion, 
      asignado_a: asignado || null, 
      estado: 'pendiente', 
      creado_por: userData?.id 
    }])
    setDescripcion(''); 
    cargarTasks();
  }

  async function responderTask(id) {
    await supabase.from('tasks').update({ respuesta: respuestas[id], estado: 'completada' }).eq('id', id)
    setRespuestas({ ...respuestas, [id]: '' }); 
    cargarTasks();
  }

  function nombreUsuario(id) {
    const u = users.find((user) => String(user.id) === String(id))
    return u ? u.nombre : 'Usuario'
  }

  return (
    <div>
      {!sonidoActivado && <button onClick={activarNotificaciones} style={{ width: '100%', padding: 20, background: 'red', color: 'white' }}>ACTIVAR NOTIFICACIONES</button>}
      
      <h1>Mis Tareas</h1>
      
      <div style={{ border: '1px solid #ddd', padding: 15, marginBottom: 20, borderRadius: 10 }}>
        <textarea placeholder="Descripción" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        <select onChange={(e) => setAsignado(e.target.value)} value={asignado}>
          <option value="">Asignar a...</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
        <button onClick={crearTask}>Enviar Tarea</button>
      </div>

      {tasks.map((t) => (
        <div key={t.id} style={{ border: '1px solid #ccc', padding: 15, margin: 10, borderRadius: 10, backgroundColor: t.estado === 'completada' ? '#f0fdf4' : '#fff' }}>
          <p><strong>Enviado por:</strong> {nombreUsuario(t.creado_por)}</p>
          <p><strong>Para:</strong> {nombreUsuario(t.asignado_a)}</p>
          <p>{t.descripcion}</p>
          
          {t.respuesta && (
             <p style={{ color: 'blue' }}><strong>Respuesta recibida:</strong> {t.respuesta}</p>
          )}

          {/* CUADRO DE RESPUESTA: Solo si es la persona asignada Y está pendiente */}
          {t.estado !== 'completada' && String(userData?.id) === String(t.asignado_a) && (
            <div style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 10 }}>
              <textarea placeholder="Tu respuesta..." onChange={(e) => setRespuestas({...respuestas, [t.id]: e.target.value})} />
              <button onClick={() => responderTask(t.id)}>Enviar Respuesta</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
export default Tasks