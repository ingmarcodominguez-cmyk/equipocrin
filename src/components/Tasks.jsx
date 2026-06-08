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
  const [alerta, setAlerta] = useState(false);

  const reproducirSonidoYVibrar = () => {
    // 1. Sonido
    const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
    audio.play().catch(e => console.log("Sonido bloqueado"));

    // 2. Vibración (solo en móviles)
    if ("vibrate" in navigator) {
      navigator.vibrate([500, 200, 500]);
    }

    // 3. Alerta Visual
    setAlerta(true);
    setTimeout(() => setAlerta(false), 5000);
  };

  useEffect(() => {
    if (!userData?.id) return

    cargarTasks()
    cargarUsuarios()

    const channel = supabase
      .channel('tasks_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, (payload) => {
        reproducirSonidoYVibrar();
        cargarTasks();
      })
      .subscribe();

    const intervalo = setInterval(() => {
      cargarTasks()
    }, 3000)

    return () => {
      clearInterval(intervalo)
      supabase.removeChannel(channel)
    }
  }, [userData])

  async function cargarTasks() {
    if (!userData?.id) return
    try {
      let query = supabase.from('tasks').select('*')
      const rolUsuario = (userData?.rol || userData?.role || '')?.toUpperCase()
      if (rolUsuario !== 'ADMINISTRACION' && rolUsuario !== 'DIRECCION') {
        query = query.or(`creado_por.eq."${userData.id}",asignado_a.eq."${userData.id}"`)
      }
      const { data, error } = await query.order('created_at', { ascending: false })
      if (data) setTasks(data)
    } catch (err) { console.error(err) }
  }

  async function cargarUsuarios() {
    try {
      const { data } = await supabase.from('users').select('*')
      if (data) setUsers(data)
    } catch (err) { console.error(err) }
  }

  async function crearTask() {
    if (!descripcion) return
    const { error } = await supabase.from('tasks').insert([{
      descripcion, asignado_a: asignado || null, estado: 'pendiente',
      fecha_vencimiento: fechaVencimiento || null, creado_por: userData?.id || null
    }])
    if (error) alert('Error')
    else { alert('Tarea creada'); setDescripcion(''); cargarTasks(); }
  }

  async function responderTask(id) {
    const { error } = await supabase.from('tasks').update({
      respuesta: respuestas[id] || '',
      estado: 'completada'
    }).eq('id', id)
    if (error) alert(JSON.stringify(error))
    else { alert('Respuesta enviada'); setRespuestas({ ...respuestas, [id]: '' }); cargarTasks(); }
  }

  function nombreUsuario(id) {
    if (!id || !users || users.length === 0) return 'No asignado'
    const usuarioEncontrado = users.find((u) => String(u.id) === String(id))
    return usuarioEncontrado?.nombre || 'Usuario no encontrado'
  }

  return (
    <div>
      {/* Alerta Visual de borde rojo */}
      {alerta && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
          pointerEvents: 'none', border: '15px solid red', 
          boxSizing: 'border-box', zIndex: 9999
        }}></div>
      )}

      {!sonidoActivado && (
        <button 
          onClick={() => { setSonidoActivado(true); alert("Sonido y vibración activos"); }}
          style={{ padding: '20px', background: 'red', color: 'white', width: '100%', fontSize: '1.2rem', marginBottom: '20px' }}
        >
          TOCÁ AQUÍ PARA ACTIVAR NOTIFICACIONES
        </button>
      )}

      <h1>Tareas</h1>

      <div style={{ marginBottom: 30 }}>
        <textarea placeholder="Descripción" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} style={{ width: '100%', minHeight: 100, padding: 10, borderRadius: 10 }} />
        <br /><br />
        <select value={asignado} onChange={(e) => setAsignado(e.target.value)} style={{ padding: 10, borderRadius: 10 }}>
          <option value="">Asignar a</option>
          {Array.isArray(users) && users.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
        <br /><br />
        <input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} style={{ padding: 10, borderRadius: 10 }} />
        <br /><br />
        <button onClick={crearTask}>Crear tarea</button>
      </div>

      {Array.isArray(tasks) && tasks.map((t) => (
        <div key={t.id} style={{ border: '1px solid #ccc', borderRadius: 12, padding: 15, marginBottom: 20, backgroundColor: t.estado === 'completada' ? '#dcfce7' : '#ffffff' }}>
          <p><strong>Asignado a:</strong> {nombreUsuario(t.asignado_a)}</p>
          <p>{t.descripcion}</p>
          {t.estado !== 'completada' ? (
            userData?.id && String(userData.id) === String(t.asignado_a) ? (
              <div>
                <textarea placeholder="Respuesta" value={respuestas[t.id] || ''} onChange={(e) => setRespuestas({ ...respuestas, [t.id]: e.target.value })} style={{ width: '100%', minHeight: 80 }} />
                <button onClick={() => responderTask(t.id)}>Responder</button>
              </div>
            ) : <p>Pendiente de respuesta.</p>
          ) : <p>✓ Completada.</p>}
        </div>
      ))}
    </div>
  )
}

export default Tasks