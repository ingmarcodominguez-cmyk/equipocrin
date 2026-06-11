import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function AgendaFija({ userData }) {
  const [sesiones, setSesiones] = useState([])
  const [pacientes, setPacientes] = useState([])
  const [users, setUsers] = useState([])
  
  // Estados para Carga y Edición
  const [dia, setDia] = useState('Lunes')
  const [hora, setHora] = useState('09:00')
  const [horarioManual, setHorarioManual] = useState('')
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState('')
  const [prestadorSeleccionado, setPrestadorSeleccionado] = useState('')
  
  const [editId, setEditId] = useState(null) // ID del turno que estamos editando
  
  // Estados para Filtros
  const [diaConsulta, setDiaConsulta] = useState('Lunes') 
  const [profesionalFiltroId, setProfesionalFiltroId] = useState('') 
  const [pacienteConsultaId, setPacienteConsultaId] = useState('') 
  const [filtroPaciente, setFiltroPaciente] = useState('')

  const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
  
  const generarHorarios = () => {
    const arr = [];
    const rangos = [[9, 12], [14, 20]];
    rangos.forEach(([inicio, fin]) => {
      for (let h = inicio; h <= fin; h++) {
        for (let m = 0; m < 60; m += 45) {
          if (h === fin && m > 0) break;
          arr.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }
      }
    });
    return arr;
  };

  const rol = userData?.rol?.toUpperCase();
  const esAdminOdireccion = rol === 'ADMINISTRACION' || rol === 'DIRECCION';

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: sData } = await supabase.from('sesiones_fijas').select('*');
    const { data: pData } = await supabase.from('pacientes').select('*').order('nombre', { ascending: true });
    const { data: uData } = await supabase.from('users').select('*').order('nombre', { ascending: true });
    setSesiones(sData || []); setPacientes(pData || []); setUsers(uData || []);
  }

  // Guardar (Nuevo o Edición)
  async function guardarSesion() {
    const horaFinal = horarioManual.trim() !== '' ? horarioManual : hora;
    const p = pacientes.find(p => p.id === pacienteSeleccionado);
    
    const payload = {
      paciente_id: pacienteSeleccionado,
      paciente_nombre: p?.nombre,
      profesional_id: prestadorSeleccionado,
      dia_semana: dia,
      hora: horaFinal,
      asistencia: 'Pendiente'
    };

    if (editId) {
      await supabase.from('sesiones_fijas').update(payload).eq('id', editId);
      setEditId(null);
    } else {
      await supabase.from('sesiones_fijas').insert([payload]);
    }
    
    alert('Sesión guardada');
    cargarDatos();
  }

  async function cambiarAsistencia(s, nuevoValor) {
    if (userData.id !== s.profesional_id && !esAdminOdireccion) return;
    await supabase.from('sesiones_fijas').update({ asistencia: nuevoValor }).eq('id', s.id);
    cargarDatos();
  }

  // Cargar datos al formulario de edición
  function iniciarEdicion(s) {
    setEditId(s.id);
    setDia(s.dia_semana);
    setHora(s.hora);
    setPacienteSeleccionado(s.paciente_id);
    setPrestadorSeleccionado(s.profesional_id);
  }

  let sesionesVisibles = esAdminOdireccion 
    ? (profesionalFiltroId ? sesiones.filter(s => s.profesional_id === profesionalFiltroId) : sesiones)
    : sesiones.filter(s => s.profesional_id === userData.id);

  const horasDelDia = sesionesVisibles.filter(s => s.dia_semana === diaConsulta).sort((a,b) => a.hora.localeCompare(b.hora));
  const pacientesFiltrados = pacientes.filter(p => p.nombre.toLowerCase().includes(filtroPaciente.toLowerCase()));

  return (
    <div style={{ color: '#fff', padding: '20px', maxWidth: '1200px', margin: 'auto' }}>
      
      {/* FORMULARIO DE CARGA/EDICIÓN */}
      <div style={{...cardStyle, marginBottom: '20px'}}>
        <h3 style={{ color: '#00f2ff', marginTop: 0 }}>{editId ? '✏️ Editar Sesión' : '➕ Nueva Sesión Fija'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
          <select style={inputStyle} value={dia} onChange={(e) => setDia(e.target.value)}>{dias.map(d => <option key={d} value={d}>{d}</option>)}</select>
          <select style={inputStyle} value={hora} onChange={(e) => { setHora(e.target.value); setHorarioManual(''); }}>{generarHorarios().map(h => <option key={h} value={h}>{h}</option>)}</select>
          <input style={inputStyle} placeholder="Hora manual" value={horarioManual} onChange={(e) => setHorarioManual(e.target.value)} />
          <select style={inputStyle} value={pacienteSeleccionado} onChange={(e) => setPacienteSeleccionado(e.target.value)}><option value="">Paciente...</option>{pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
          <select style={inputStyle} value={prestadorSeleccionado} onChange={(e) => setPrestadorSeleccionado(e.target.value)}><option value="">Profesional...</option>{users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
          <button onClick={guardarSesion} style={btnAccionStyle}>{editId ? 'ACTUALIZAR' : 'GUARDAR'}</button>
          {editId && <button onClick={() => setEditId(null)} style={{...btnAccionStyle, background: '#444'}}>CANCELAR</button>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ color: '#00f2ff' }}>📅 Agenda Fija</h2>
            {esAdminOdireccion && (
              <select style={inputStyle} onChange={(e) => setProfesionalFiltroId(e.target.value)}>
                <option value="">Todos los profesionales</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            )}
          </div>
          <div style={{ display: 'flex', gap: '5px', marginBottom: '10px', overflowX: 'auto' }}>
            {dias.map(d => <button key={d} onClick={() => setDiaConsulta(d)} style={btnTabStyle(diaConsulta === d)}>{d.substring(0,3).toUpperCase()}</button>)}
          </div>
          <div style={cardStyle}>
            {horasDelDia.map(s => (
              <div key={s.id} style={{...filaStyle, background: s.asistencia === 'Presente' ? '#00331a' : s.asistencia === 'Ausente' ? '#330000' : 'transparent'}}>
                <span style={{ fontWeight: 'bold', width: '80px' }}>{s.hora}</span>
                <span style={{ flexGrow: 1 }}>{s.paciente_nombre} <small style={{ opacity: 0.6 }}>({users.find(u => u.id === s.profesional_id)?.nombre})</small></span>
                <button onClick={() => iniciarEdicion(s)} style={{background: 'none', border: 'none', color: '#00f2ff', cursor: 'pointer', marginRight: '10px'}}>✏️</button>
                <select value={s.asistencia || 'Pendiente'} onChange={(e) => cambiarAsistencia(s, e.target.value)} style={selectStyle}>
                  <option value="Pendiente">⏳</option><option value="Presente">✅</option><option value="Ausente">❌</option><option value="Cancelado">🚫</option>
                </select>
              </div>
            ))}
          </div>
        </div>

        <div style={cardStyle}>
          <h3 style={{ color: '#00f2ff' }}>🔎 Auditoría Paciente</h3>
          <input style={{...inputStyle, width: '100%', marginBottom: '10px'}} placeholder="Buscar nombre..." onChange={(e) => setFiltroPaciente(e.target.value)} />
          <select style={{...inputStyle, width: '100%'}} onChange={(e) => setPacienteConsultaId(e.target.value)} size={8}>
            {pacientesFiltrados.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          {sesiones.filter(s => s.paciente_id === pacienteConsultaId).map(s => (
            <div key={s.id} style={{ padding: '8px', background: '#1a1a1a', borderRadius: '5px', marginTop: '5px', fontSize: '0.8rem' }}>
              <strong>{s.dia_semana}</strong> - {s.hora} hs | {users.find(u => u.id === s.profesional_id)?.nombre}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const cardStyle = { background: '#0a0a0a', border: '1px solid #333', borderRadius: '15px', padding: '20px' };
const inputStyle = { background: '#000', border: '1px solid #444', color: '#fff', padding: '8px', borderRadius: '8px' };
const btnAccionStyle = { background: '#00f2ff', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', padding: '8px' };
const selectStyle = { background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' };
const filaStyle = { padding: '10px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center' };
const btnTabStyle = (activo) => ({ padding: '8px 12px', borderRadius: '5px', border: 'none', background: activo ? '#00f2ff' : '#222', color: activo ? '#000' : '#fff', cursor: 'pointer', fontWeight: 'bold' });

export default AgendaFija;