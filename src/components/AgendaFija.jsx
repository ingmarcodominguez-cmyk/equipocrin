import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function AgendaFija({ userData }) {
  const [sesiones, setSesiones] = useState([])
  const [pacientes, setPacientes] = useState([])
  const [users, setUsers] = useState([])
  const [dia, setDia] = useState('Lunes')
  const [hora, setHora] = useState('09:00')
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState('')
  const [prestadorSeleccionado, setPrestadorSeleccionado] = useState('')
  const [prestacion, setPrestacion] = useState('')
  const [diaConsulta, setDiaConsulta] = useState('Lunes') 
  const [pacienteConsultaId, setPacienteConsultaId] = useState('') 
  const [filtroPaciente, setFiltroPaciente] = useState('') // Estado para búsqueda rápida

  const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
  const horarios = ['09:00', '09:45', '10:30', '11:15', '12:00', '12:45', '13:30', '14:15', '15:00', '15:45', '16:30', '17:15', '18:00', '18:45', '19:30', '20:15']

  const rol = userData?.rol?.toUpperCase();
  const esAdminOdireccion = rol === 'ADMINISTRACION' || rol === 'DIRECCION';

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    // Traemos pacientes ordenados alfabéticamente desde el inicio
    const { data: sData } = await supabase.from('sesiones_fijas').select('*');
    const { data: pData } = await supabase.from('pacientes').select('*').order('nombre', { ascending: true });
    const { data: uData } = await supabase.from('users').select('*').order('nombre', { ascending: true });
    
    setSesiones(sData || []);
    setPacientes(pData || []);
    setUsers(uData || []);
  }

  const sesionesVisibles = esAdminOdireccion ? sesiones : sesiones.filter(s => s.profesional_id === userData.id);
  
  // Filtro de pacientes para el buscador rápido
  const pacientesFiltrados = pacientes.filter(p => 
    p.nombre.toLowerCase().includes(filtroPaciente.toLowerCase())
  );

  async function agregarSesion() {
    const p = pacientes.find(p => p.id === pacienteSeleccionado)
    const { error } = await supabase.from('sesiones_fijas').insert([{
      paciente_id: pacienteSeleccionado, paciente_nombre: p?.nombre,
      profesional_id: prestadorSeleccionado, dia_semana: dia, hora: hora, tipo_prestacion: prestacion
    }])
    if (!error) { alert('Sesión guardada'); cargarDatos() }
    else alert('Error: ' + error.message)
  }

  return (
    <div style={{ color: '#fff' }}>
      {esAdminOdireccion && (
        <div style={cardStyle}>
          <h2 style={{ color: '#00f2ff', marginTop: 0 }}>➕ Registrar Sesión</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
            <select style={inputStyle} onChange={(e) => setDia(e.target.value)}>{dias.map(d => <option key={d} value={d}>{d}</option>)}</select>
            <select style={inputStyle} onChange={(e) => setHora(e.target.value)}>{horarios.map(h => <option key={h} value={h}>{h}</option>)}</select>
            <select style={inputStyle} onChange={(e) => setPacienteSeleccionado(e.target.value)}><option value="">Paciente...</option>{pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
            <select style={inputStyle} onChange={(e) => setPrestadorSeleccionado(e.target.value)}><option value="">Profesional...</option>{users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
            <input style={inputStyle} placeholder="Prestación" onChange={(e) => setPrestacion(e.target.value)} />
            <button onClick={agregarSesion} style={btnAccionStyle}>GUARDAR</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', overflowX: 'auto' }}>
        {dias.map(d => (
          <button key={d} onClick={() => setDiaConsulta(d)} style={btnTabStyle(diaConsulta === d)}>
            {d.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div style={cardStyle}>
          <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '10px', color: '#00f2ff' }}>Horarios: {diaConsulta}</h3>
          {sesionesVisibles.filter(s => s.dia_semana === diaConsulta).map(s => (
            <div key={s.id} style={filaStyle}>
              <span style={{ color: '#00f2ff', fontWeight: 'bold', width: '80px' }}>{s.hora}</span>
              <span>{s.paciente_nombre} <small style={{ color: '#888' }}>({users.find(u => u.id === s.profesional_id)?.nombre})</small></span>
            </div>
          ))}
        </div>

        <div style={cardStyle}>
          <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '10px', color: '#00f2ff' }}>Auditoría</h3>
          <input 
            style={{...inputStyle, width: '100%', marginBottom: '10px'}} 
            placeholder="🔎 Buscar paciente..." 
            onChange={(e) => setFiltroPaciente(e.target.value)} 
          />
          <select style={inputStyle} onChange={(e) => setPacienteConsultaId(e.target.value)} size={5}>
            <option value="">Seleccionar paciente...</option>
            {pacientesFiltrados.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          
          {sesionesVisibles.filter(s => s.paciente_id === pacienteConsultaId).map(s => (
            <div key={s.id} style={{ padding: '10px', background: '#1a1a1a', borderRadius: '8px', marginTop: '10px', fontSize: '0.9rem' }}>
              {s.dia_semana} | {s.hora} hs | <span style={{ color: '#00ff9d' }}>{s.tipo_prestacion}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const cardStyle = { background: '#0a0a0a', border: '1px solid #333', borderRadius: '15px', padding: '20px', marginBottom: '20px' };
const inputStyle = { background: '#000', border: '1px solid #444', color: '#fff', padding: '10px', borderRadius: '8px', fontFamily: 'inherit' };
const btnAccionStyle = { background: '#00f2ff', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' };
const filaStyle = { padding: '12px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center' };
const btnTabStyle = (activo) => ({ 
  padding: '10px 20px', borderRadius: '8px', border: activo ? '1px solid #00f2ff' : '1px solid #333', 
  background: activo ? '#00f2ff' : 'transparent', color: activo ? '#000' : '#fff', cursor: 'pointer', fontWeight: 'bold' 
});

export default AgendaFija;