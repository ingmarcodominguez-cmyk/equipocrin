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

  // Permisos: Aseguramos que el rol sea string y esté en mayúsculas
  const rol = userData?.rol?.toUpperCase() || "";
  const tieneAcceso = ['ADMINISTRACION', 'DIRECCION', 'PROFESIONAL_PLUS'].includes(rol);

  useEffect(() => {
    if (!tieneAcceso) return;
    
    async function cargarDatos() {
      const { data: tData } = await supabase.from('turnos').select('*');
      const { data: uData } = await supabase.from('users').select('*');
      if (tData) setTurnos(tData);
      if (uData) setUsers(uData);
    }
    
    cargarDatos();

    const channel = supabase
      .channel('realtime:public:turnos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turnos' }, () => {
        cargarDatos();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tieneAcceso]);

  // Si no tiene acceso, mostramos mensaje amigable
  if (!tieneAcceso) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#fff' }}>
        <h2>Acceso Restringido</h2>
        <p>No tienes permisos suficientes para visualizar este módulo.</p>
      </div>
    );
  }

  // Generador de turnos
  const generarHorarios = () => {
    const arr = []; let h = 9, m = 0;
    while (h < 18 || (h === 18 && m === 0)) {
      arr.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      m += 45; if (m >= 60) { h += 1; m -= 60; }
    }
    return arr;
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
    <div style={{ padding: '20px', backgroundColor: '#FFFFFF', color: '#000000', borderRadius: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '20px' }}>
        <button onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1))}>← Anterior</button>
        <h2 style={{ margin: 0 }}>{mesActual.toLocaleString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase()}</h2>
        <button onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1))}>Siguiente →</button>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', border: '1px solid #ddd' }}>
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontWeight: 'bold', padding: '10px', backgroundColor: '#f4f4f4' }}>{d}</div>
        ))}
        {[...Array(offset)].map((_, i) => <div key={`e-${i}`} style={{ minHeight: '100px' }}></div>)}
        {[...Array(diasEnMes)].map((_, i) => {
          const dN = i + 1;
          const tD = (turnos || []).filter(t => {
             const d = new Date(t.fecha_inicio);
             return d.getMonth() === mesActual.getMonth() && d.getDate() === dN && d.getFullYear() === mesActual.getFullYear();
          });
          return (
            <div key={i} style={{ minHeight: '100px', border: '1px solid #eee', padding: '5px' }}>
              <div onClick={() => { setDiaSeleccionado(dN); setTurnoEditando(null); }} style={{ cursor: 'pointer', color: '#007bff', fontWeight: 'bold' }}>{dN} +</div>
              {tD.map(t => (
                <div key={t.id} onClick={(e) => { e.stopPropagation(); setTurnoEditando(t); setForm({...t, hora: t.fecha_inicio.split('T')[1].substring(0,5)}); setDiaSeleccionado(dN); }} style={{ fontSize: '9px', background: obtenerColor(t.estado), margin: '2px 0', padding: '2px', cursor: 'pointer' }}>
                  {t.paciente_nombre}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default AgendaMensualPro;