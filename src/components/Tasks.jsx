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

  // --- FUNCIÓN DE WHATSAPP CON MENSAJE MISTERIOSO ---
  const enviarPorWhatsAppIndividual = (usuariosSeleccionados) => {
    usuariosSeleccionados.forEach(u => {
      if (u.telefono) {
        const telefonoLimpio = u.telefono.replace(/\D/g, ''); 
        // Mensaje enfocado en que el usuario abra la app
        const mensaje = `🔔 *Hola ${u.nombre}*, tienes una nueva tarea pendiente en la plataforma.\n\n` +
                        `Por favor, ingresa al sistema para ver los detalles y completar la gestión.`;
        
        const url = `https://wa.me/${telefonoLimpio}?text=${encodeURIComponent(mensaje)}`;
        window.open(url, '_blank');
      } else {
        console.warn(`El usuario ${u.nombre} no tiene número de teléfono registrado.`);
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
  }, [userData?.id, userData?.rol]);

  async function cargarTasks() {
    if (!userData?.id) return;
    const rolesConAccesoTotal = ['ADMINISTRACION', 'DIRECCION'];
    let query = supabase.from('tasks').select('*').order('created_at', { ascending: false });
    if (!rolesConAccesoTotal.includes(userData.rol)) {
      query = query.or(`creado_por.eq.${userData.id},asignado_a.eq.${userData.id}`);
    }
    const { data } = await query;
    if (data) setTasks(data);
  }

  async function cargarUsuarios() {
    const { data, error } = await supabase.from('users').select('id, nombre, telefono');
    if (error) {
      console.error("Error al cargar usuarios:", error);
    } else if (data) {
      setUsers(data);
    }
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
      
      const quiereAvisar = confirm(`¿Deseas enviar un aviso por WhatsApp a los ${usuariosSeleccionados.length} destinatarios?`);
      
      if (quiereAvisar) {
        enviarPorWhatsAppIndividual(usuariosSeleccionados);
      }

      setDescripcion(''); setFechaVencimiento(''); setAsignados([]);
      cargarTasks(); 
    } else {
      alert("Error al crear: " + error.message);
    }
  }

  const toggleAsignado = (userId) => {
    setAsignados(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  async function responderTask(id) {
    if (!respuestas[id]) return;
    const { error } = await supabase.from('tasks').update({ 
      respuesta: respuestas[id], 
      estado: 'completada' 
    }).eq('id', id);
    
    if (!error) setRespuestas({ ...respuestas, [id]: '' });
  }

  function nombreUsuario(id) {
    const u = users.find((user) => String(user.id) === String(id));
    return u ? u.nombre : 'Usuario';
  }

  return (
    <div style={{ color: '#fff' }}>
      {!sonidoActivado && (
        <button onClick={activarNotificaciones} style={btnNotifStyle}>🔔 ACTIVAR NOTIFICACIONES</button>
      )}
      <h2 style={{ color: '#00f2ff', marginBottom: '20px' }}>Gestión de Tareas</h2>
      
      <div style={formStyle}>
        <h3 style={{ marginTop: 0 }}>Nueva Tarea (Múltiple)</h3>
        <textarea placeholder="Descripción..." value={descripcion} onChange={(e) => setDescripcion(e.target.value)} style={inputStyle} />
        
        <div style={{ margin: '10px 0', padding: '10px', background: '#000', borderRadius: '8px', border: '1px solid #444', maxHeight: '150px', overflowY: 'auto' }}>
          <p style={{ margin: '0 0 10px 0', fontSize: '0.8rem', color: '#aaa' }}>Seleccionar destinatarios:</p>
          {users.map(u => (
            <label key={u.id} style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', cursor: 'pointer' }}>
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

const cardStyle = { background: '#0a0a0a', border: '1px solid #333', borderRadius: '15px', padding: '20px' };
const formStyle = { background: '#111', border: '1px solid #333', padding: '20px', borderRadius: '15px', marginBottom: '30px' };
const inputStyle = { width: '100%', background: '#000', border: '1px solid #444', color: '#fff', padding: '12px', borderRadius: '8px', marginBottom: '10px', fontFamily: 'inherit', boxSizing: 'border-box' };
const btnEnviarStyle = { width: '100%', padding: '12px', background: 'transparent', border: '1px solid #00f2ff', color: '#00f2ff', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' };
const btnNotifStyle = { width: '100%', padding: '10px', background: '#ff4444', color: '#fff', border: 'none', borderRadius: '8px', marginBottom: '20px', cursor: 'pointer' };

export default Tasks;