import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function Tasks({ userData, playNotification }) {
  const [tasks, setTasks] = useState([])
  const [descripcion, setDescripcion] = useState('')
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [asignados, setAsignados] = useState([])
  const [users, setUsers] = useState([])
  const [respuestas, setRespuestas] = useState({})
  const [sonidoActivado, setSonidoActivado] = useState(false);
  const [usuarioFiltro, setUsuarioFiltro] = useState('');

  const esAdmin = ['ADMINISTRACION', 'DIRECCION'].includes(userData?.rol?.toUpperCase());

  // --- FUNCIÓN DE WHATSAPP ---
  const enviarPorWhatsAppIndividual = (usuariosSeleccionados) => {
    usuariosSeleccionados.forEach(u => {
      if (u.telefono) {
        const telefonoLimpio = u.telefono.replace(/\D/g, ''); 
        const mensaje = `🔔 *Hola ${u.nombre}*, tienes una nueva tarea pendiente en la plataforma.\n\n` +
                        `Por favor, ingresa al sistema para ver los detalles y completar la gestión.`;
        const url = `https://wa.me/${telefonoLimpio}?text=${encodeURIComponent(mensaje)}`;
        window.open(url, '_blank');
      }
    });
  };

  const activarNotificaciones = () => {
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }
    setSonidoActivado(true);
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
  }, [userData?.id, userData?.rol, usuarioFiltro]);

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
    if (data) setTasks(data);
  }

  async function cargarUsuarios() {
    const { data } = await supabase.from('users').select('id, nombre, telefono');
    if (data) setUsers(data);
  }

  async function crearTask() {
    if (!descripcion || asignados.length === 0 || !fechaVencimiento) 
      return alert("Completa descripción, fecha y al menos un destinatario");

    const nuevasTareas = asignados.map(userId => ({
      descripcion,
      asignado_a: userId,
      fecha_vencimiento: fechaVencimiento,
      estado: 'pendiente',
      creado_por: userData?.id
    }));

    const { error } = await supabase.from('tasks').insert(nuevasTareas);
    if (!error) {
      const usuariosSeleccionados = users.filter(u => asignados.includes(String(u.id)));
      if (confirm(`¿Enviar aviso por WhatsApp?`)) {
        enviarPorWhatsAppIndividual(usuariosSeleccionados);
      }
      setDescripcion(''); setFechaVencimiento(''); setAsignados([]);
      cargarTasks(); 
    }
  }

  const toggleAsignado = (userId) => {
    setAsignados(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };

  async function responderTask(id) {
    if (!respuestas[id]) return;
    await supabase.from('tasks').update({ respuesta: respuestas[id], estado: 'completada' }).eq('id', id);
    setRespuestas({ ...respuestas, [id]: '' });
  }

  function nombreUsuario(id) {
    const u = users.find((user) => String(user.id) === String(id));
    return u ? u.nombre : 'Usuario';
  }

  return (
    <div style={{ color: '#fff' }}>
      {!sonidoActivado && <button onClick={activarNotificaciones} style={btnNotifStyle}>🔔 ACTIVAR NOTIFICACIONES</button>}
      <h2 style={{ color: '#00f2ff', marginBottom: '20px' }}>Gestión de Tareas</h2>
      
      {esAdmin && (
        <div style={{ marginBottom: '20px', background: '#111', padding: '15px', borderRadius: '8px' }}>
          <label>Filtrar por participante:</label>
          <select value={usuarioFiltro} onChange={(e) => setUsuarioFiltro(e.target.value)} style={inputStyle}>
            <option value="">-- Todos los participantes --</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
      )}

      <div style={formStyle}>
        <textarea placeholder="Descripción..." value={descripcion} onChange={(e) => setDescripcion(e.target.value)} style={inputStyle} />
        <div style={{ margin: '10px 0', padding: '10px', background: '#000', maxHeight: '150px', overflowY: 'auto' }}>
          {users.map(u => (
            <label key={u.id} style={{ display: 'block' }}>
              <input type="checkbox" checked={asignados.includes(String(u.id))} onChange={() => toggleAsignado(String(u.id))} /> {u.nombre}
            </label>
          ))}
        </div>
        <input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} style={inputStyle} />
        <button onClick={crearTask} style={btnEnviarStyle}>ENVIAR TAREAS</button>
      </div>

      <div style={{ display: 'grid', gap: '20px' }}>
        {tasks.map((t) => (
          <div key={t.id} style={cardStyle}>
            <div><span>👤 De: {nombreUsuario(t.creado_por)}</span> <span>➡️ Para: {nombreUsuario(t.asignado_a)}</span></div>
            <p>{t.descripcion}</p>
            {t.estado === 'completada' ? (
              <div style={{ background: '#1a1a1a', padding: '10px' }}>{t.respuesta}</div>
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
const inputStyle = { width: '100%', background: '#000', border: '1px solid #444', color: '#fff', padding: '12px', borderRadius: '8px', marginBottom: '10px' };
const btnEnviarStyle = { width: '100%', padding: '12px', background: 'transparent', border: '1px solid #00f2ff', color: '#00f2ff', borderRadius: '8px', cursor: 'pointer' };
const btnNotifStyle = { width: '100%', padding: '10px', background: '#ff4444', color: '#fff', border: 'none', borderRadius: '8px', marginBottom: '20px', cursor: 'pointer' };

export default Tasks;