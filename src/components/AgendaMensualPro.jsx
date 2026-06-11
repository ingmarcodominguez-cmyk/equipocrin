import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function AgendaMensualPro({ userData }) {
  const [turnos, setTurnos] = useState([])
  const [users, setUsers] = useState([])
  const [mesActual, setMesActual] = useState(new Date())
  const [diaSeleccionado, setDiaSeleccionado] = useState(null)
  const [turnoEditando, setTurnoEditando] = useState(null)
  
  const [form, setForm] = useState({ 
    paciente_nombre: '', profesional_id: '', tipo_turno: 'consulta', 
    hora: '09:00', observaciones: '', estado: 'pendiente' 
  })

  // Definición de roles autorizados para este módulo
  const rol = userData?.rol?.toUpperCase();
  const tieneAcceso = ['ADMINISTRACION', 'DIRECCION', 'PROFESIONAL_PLUS'].includes(rol);

  useEffect(() => {
    if (!tieneAcceso) return; // Si no tiene permiso, no cargamos nada
    
    cargarTurnos();
    cargarUsuarios();

    const channel = supabase
      .channel('realtime:public:turnos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turnos' }, () => {
        cargarTurnos();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tieneAcceso]);

  // Si el usuario no tiene acceso, mostramos un mensaje de restricción
  if (!tieneAcceso) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
        <h2>Acceso Restringido</h2>
        <p>No tienes permisos para visualizar la Agenda Mensual.</p>
      </div>
    );
  }

  async function cargarTurnos() {
    const { data } = await supabase.from('turnos').select('*')
    if (data) setTurnos(data)
  }

  async function cargarUsuarios() {
    const { data } = await supabase.from('users').select('*')
    if (data) setUsers(data)
  }

  const generarHorarios = () => {
    const arr = []; let h = 9, m = 0;
    while (h < 18 || (h === 18 && m === 0)) {
      arr.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      m += 45; if (m >= 60) { h += 1; m -= 60; }
    }
    return arr;
  }

  const abrirNuevoTurno = (dia) => {
    setForm({ paciente_nombre: '', profesional_id: '', tipo_turno: 'consulta', hora: '09:00', observaciones: '', estado: 'pendiente' });
    setTurnoEditando(null);
    setDiaSeleccionado(dia);
  }

  async function guardarTurno() {
    const anio = mesActual.getFullYear();
    const mes = String(mesActual.getMonth() + 1).padStart(2, '0');
    const dia = String(diaSeleccionado).padStart(2, '0');
    const fechaCompleta = `${anio}-${mes}-${dia}T${form.hora}:00`;
    
    const payload = { 
      paciente_nombre: form.paciente_nombre, 
      profesional_id: form.profesional_id, 
      tipo_turno: form.tipo_turno, 
      fecha_inicio: fechaCompleta, 
      observaciones: form.observaciones,
      estado: form.estado 
    }

    if (turnoEditando) {
      await supabase.from('turnos').update(payload).eq('id', turnoEditando.id)
    } else {
      await supabase.from('turnos').insert(payload)
    }
    
    setDiaSeleccionado(null); 
    setTurnoEditando(null);
  }

  const obtenerColor = (e) => e === 'realizado' ? '#d4edda' : e === 'cancelado' ? '#f8d7da' : '#f8f9fa'

  const diasEnMes = new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 0).getDate();
  const primerDiaDelMes = new Date(mesActual.getFullYear(), mesActual.getMonth(), 1).getDay();
  const offset = primerDiaDelMes === 0 ? 6 : primerDiaDelMes - 1;

  return (
    <div style={{ padding: '10px', backgroundColor: '#FFFFFF', color: '#000000', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      {/* ... El resto de tu renderizado visual igual que antes ... */}
      {/* Como el acceso ya está bloqueado al principio, este código solo se renderiza si tiene permiso */}
    </div>
  )
}

export default AgendaMensualPro;