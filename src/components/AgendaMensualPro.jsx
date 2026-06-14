import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function AgendaMensualPro({ userData }) {
  const [turnos, setTurnos] = useState([])
  const [users, setUsers] = useState([])
  const [mesActual, setMesActual] = useState(new Date())
  const [diaSeleccionado, setDiaSeleccionado] = useState(null)
  const [turnoEditando, setTurnoEditando] = useState(null)
  
  const [form, setForm] = useState({ 
    paciente_nombre: '', profesional_id: '', prestacion: 'Turno primera vez', 
    hora: '09:00', observaciones: '', estado: 'pendiente' 
  })

  // 1. Lógica de roles: Dirección también ve todo
  const rol = userData?.rol?.toUpperCase() || "";
  const esAdmin = (rol === 'ADMINISTRACION' || rol === 'DIRECCION');

  useEffect(() => {
    cargarDatos();
  }, [mesActual]);

  async function cargarDatos() {
    const { data: t } = await supabase.from('turnos').select('*');
    const { data: u } = await supabase.from('users').select('*');
    if (t) setTurnos(t);
    if (u) setUsers(u);
  }

  // 2. Filtro: Si no es Admin/Dirección, filtra obligatoriamente por su ID
  const turnosVisibles = esAdmin 
    ? turnos 
    : turnos.filter(t => String(t.profesional_id || '').trim() === String(userData?.id || '').trim());

  const prestaciones = ['Turno primera vez', 'Evaluacion', 'Reunion', 'Entrenamiento', 'Devolucion'];

  const generarHorarios = () => {
    const arr = [];
    
    // Mañana: bloques de 45 min de 09:00 a 12:45
    // 09:00, 09:45, 10:30, 11:15, 12:00, 12:45
    let horaMa = 9, minMa = 0;
    while (horaMa < 13 || (horaMa === 12 && minMa <= 45)) {
      if (horaMa === 13) break;
      arr.push(`${String(horaMa).padStart(2, '0')}:${String(minMa).padStart(2, '0')}`);
      minMa += 45;
      if (minMa >= 60) {
        horaMa += 1;
        minMa -= 60;
      }
    }

    // Tarde: bloques de 45 min de 14:00 a 20:30
    // 14:00, 14:45, 15:30, 16:15, 17:00, 17:45, 18:30, 19:15, 20:00, 20:45 (se detiene antes de las 21)
    let horaTa = 14, minTa = 0;
    while (horaTa < 21) {
      arr.push(`${String(horaTa).padStart(2, '0')}:${String(minTa).padStart(2, '0')}`);
      minTa += 45;
      if (minTa >= 60) {
        horaTa += 1;
        minTa -= 60;
      }
    }
    return arr;
  };

  async function guardarTurno() {
    const fechaISO = `${mesActual.getFullYear()}-${String(mesActual.getMonth() + 1).padStart(2, '0')}-${String(diaSeleccionado).padStart(2, '0')}T${form.hora}:00`;
    const profesionalObj = users.find(u => String(u.id) === String(form.profesional_id));
    const nombreProf = profesionalObj ? profesionalObj.nombre : 'Sin Prof.';
    const obsEmpaquetadas = `[${form.hora}] [${form.prestacion}] [${nombreProf}] ${form.observaciones}`;
    
    const payload = { 
      paciente_nombre: form.paciente_nombre, 
      profesional_id: form.profesional_id, 
      fecha_inicio: fechaISO, 
      observaciones: obsEmpaquetadas, 
      estado: form.estado 
    };

    if (turnoEditando) {
      await supabase.from('turnos').update(payload).eq('id', turnoEditando.id);
    } else {
      await supabase.from('turnos').insert([payload]);
    }
    
    setDiaSeleccionado(null);
    setTurnoEditando(null);
    cargarDatos();
  }

  const diasEnMes = new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 0).getDate();
  const offset = (new Date(mesActual.getFullYear(), mesActual.getMonth(), 1).getDay() + 6) % 7;

  // ESTILOS CORREGIDOS PARA ELIMINAR ESPACIOS NEGROS
  return (
    <div style={{ 
      padding: '0', // MODIFICADO: Eliminado padding para que el calendario llegue al borde
      backgroundColor: '#ffffff', // Asegurado fondo blanco en todo el contenedor
      color: '#000000', 
      borderRadius: '0', // MODIFICADO: Eliminado borderRadius para un look más limpio
      fontSize: '14px', 
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }}>
      
      {/* Cabecera con márgenes laterales para que no toque los bordes */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        gap: '20px', 
        margin: '20px auto', 
        width: 'calc(100% - 40px)',
        maxWidth: '800px'
      }}>
        <button onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1))}>← Anterior</button>
        <h2 style={{ fontSize: '20px', margin: 0 }}>{mesActual.toLocaleString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase()}</h2>
        <button onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1))}>Siguiente →</button>
      </div>

      {/* Grid del calendario CORREGIDO */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(7, 1fr)', 
        backgroundColor: '#ffffff', // MODIFICADO: Fondo blanco en la grilla para eliminar huecos negros
        borderTop: '1px solid #ddd', // Borde superior para separar de la cabecera
        flex: 1, // Permite que el grid use todo el espacio vertical disponible
        width: '100%' // Asegura que cubra todo el ancho
      }}>
        {/* Encabezados de días */}
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
          <div key={d} style={{ 
            textAlign: 'center', 
            background: '#f8f9fa', // Un gris muy claro para diferenciar la cabecera
            padding: '12px 10px', 
            fontWeight: 'bold', 
            borderRight: '1px solid #ddd',
            borderBottom: '1px solid #ddd'
          }}>
            {d}
          </div>
        ))}

        {/* Celdas vacías (offset) */}
        {[...Array(offset)].map((_, i) => (
          <div key={`off-${i}`} style={{ 
            background: '#ffffff', 
            minHeight: '120px', 
            borderRight: '1px solid #ddd',
            borderBottom: '1px solid #ddd' 
          }} />
        ))}

        {/* Celdas de días con turnos */}
        {[...Array(diasEnMes)].map((_, i) => {
          const dN = i + 1;
          const tD = (turnosVisibles || []).filter(t => {
            const f = new Date(t.fecha_inicio);
            return f.getUTCDate() === dN && f.getUTCMonth() === mesActual.getMonth() && f.getUTCFullYear() === mesActual.getFullYear();
          });
          
          return (
            <div key={i} style={{ 
              minHeight: '120px', 
              background: '#ffffff', 
              padding: '10px 5px 5px 5px', // Padding interno ajustado
              borderRight: '1px solid #ddd',
              borderBottom: '1px solid #ddd',
              position: 'relative' // Para posicionar el número del día
            }}>
              {/* Número del día (+) */}
              <div onClick={() => { 
                setDiaSeleccionado(dN); 
                setTurnoEditando(null); 
                setForm({ paciente_nombre: '', profesional_id: '', prestacion: 'Turno primera vez', hora: '09:00', observaciones: '', estado: 'pendiente' }); 
              }} style={{ 
                cursor: 'pointer', 
                color: '#007bff', 
                fontWeight: 'bold',
                marginBottom: '10px',
                display: 'inline-block'
              }}>
                {dN} +
              </div>

              {/* Listado de turnos dentro de la celda */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {tD.map(t => {
                  const parts = t.observaciones?.split(']') || [];
                  const hora = parts[0]?.replace('[', '') || '--:--';
                  const prest = parts[1]?.replace('[', '') || '';
                  const prof = parts[2]?.replace('[', '') || 'N/A';
                  return (
                    <div key={t.id} onClick={(e) => { 
                      e.stopPropagation(); 
                      setTurnoEditando(t); 
                      setForm({...t, hora: hora, prestacion: prest}); 
                      setDiaSeleccionado(dN); 
                    }} style={{ 
                      fontSize: '11px', 
                      background: t.estado === 'realizado' ? '#d4edda' : t.estado === 'cancelado' ? '#f8d7da' : '#eefaff', 
                      padding: '5px', 
                      cursor: 'pointer', 
                      borderRadius: '4px', 
                      border: '1px solid #ddd',
                      color: '#333'
                    }}>
                      <strong>{hora}</strong> | {t.paciente_nombre} | <em>{prest}</em> | <b>{prof}</b>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal / Formulario (Sin cambios en lógica, solo asegurado fondo blanco) */}
      {diaSeleccionado && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#ffffff', padding: '25px', width: '350px', borderRadius: '15px', color: '#000000' }}>
            <h3>{turnoEditando ? 'Editar Turno' : 'Nuevo Turno'}</h3>
            {/* ...resto del formulario... */}
            <input placeholder="Paciente" value={form.paciente_nombre} onChange={e => setForm({...form, paciente_nombre: e.target.value})} style={{width: '100%', marginBottom: 15, padding: '10px'}} />
            <select value={form.prestacion} onChange={e => setForm({...form, prestacion: e.target.value})} style={{width: '100%', marginBottom: 15, padding: '10px'}}>{prestaciones.map(p => <option key={p} value={p}>{p}</option>)}</select>
            <select value={form.profesional_id} onChange={e => setForm({...form, profesional_id: e.target.value})} style={{width: '100%', marginBottom: 15, padding: '10px'}}><option value="">Seleccionar Profesional...</option>{users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: 15 }}>
              <select value={form.hora} onChange={e => setForm({...form, hora: e.target.value})} style={{padding: '10px'}}>{generarHorarios().map(h => <option key={h} value={h}>{h}</option>)}</select>
              <input placeholder="Manual (HH:MM)" value={form.hora} onChange={e => setForm({...form, hora: e.target.value})} style={{padding: '10px'}} />
            </div>
            <select value={form.estado} onChange={e => setForm({...form, estado: e.target.value})} style={{width: '100%', marginBottom: 15, padding: '10px'}}><option value="pendiente">⏳ Pendiente</option><option value="realizado">✅ Realizado</option><option value="cancelado">❌ Cancelado</option></select>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={guardarTurno} style={{flex: 1, padding: '12px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer'}}>GUARDAR</button>
              <button onClick={() => setDiaSeleccionado(null)} style={{flex: 1, padding: '12px', background: '#ccc', border: 'none', borderRadius: '8px', cursor: 'pointer'}}>CERRAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AgendaMensualPro;