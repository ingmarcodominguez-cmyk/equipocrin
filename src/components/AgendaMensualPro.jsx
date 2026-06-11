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

  const rol = userData?.rol?.toUpperCase() || "";
  const tieneAcceso = ['ADMINISTRACION', 'DIRECCION', 'PROFESIONAL_PLUS'].includes(rol);

  useEffect(() => {
    if (!tieneAcceso) return;
    cargarDatos();
  }, [tieneAcceso]);

  async function cargarDatos() {
    const { data: t } = await supabase.from('turnos').select('*');
    const { data: u } = await supabase.from('users').select('*');
    if (t) setTurnos(t);
    if (u) setUsers(u);
  }

  const generarHorarios = () => {
    const arr = [];
    // Rango 1: 09:00 a 12:45
    for (let h = 9; h <= 12; h++) {
      for (let m = 0; m < 60; m += 45) {
        if (h === 12 && m > 45) break;
        arr.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
    // Rango 2: Desde las 14:00 en adelante
    for (let h = 14; h <= 20; h++) {
      for (let m = 0; m < 60; m += 45) {
        arr.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
    return arr;
  };

  async function guardarTurno() {
    const fecha = `${mesActual.getFullYear()}-${String(mesActual.getMonth() + 1).padStart(2, '0')}-${String(diaSeleccionado).padStart(2, '0')}T${form.hora}:00`;
    const payload = { ...form, fecha_inicio: fecha };
    
    if (turnoEditando) {
      await supabase.from('turnos').update(payload).eq('id', turnoEditando.id);
    } else {
      await supabase.from('turnos').insert([payload]);
    }
    setDiaSeleccionado(null);
    setTurnoEditando(null);
    cargarDatos();
  }

  if (!tieneAcceso) return <div style={{ color: '#fff', padding: 20 }}>Acceso restringido.</div>;

  const diasEnMes = new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 0).getDate();
  const offset = new Date(mesActual.getFullYear(), mesActual.getMonth(), 1).getDay() - 1;

  return (
    <div style={{ padding: '20px', backgroundColor: '#fff', color: '#000', borderRadius: '10px' }}>
      {/* NAVEGACIÓN MESES */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '20px' }}>
        <button onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1))}>← Anterior</button>
        <h2>{mesActual.toLocaleString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase()}</h2>
        <button onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1))}>Siguiente →</button>
      </div>

      {/* GRILLA */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', border: '1px solid #ccc' }}>
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <div key={d} style={{ textAlign: 'center', background: '#f4f4f4', padding: '10px' }}>{d}</div>)}
        {[...Array(offset < 0 ? 6 : offset)].map((_, i) => <div key={i} />)}
        {[...Array(diasEnMes)].map((_, i) => {
          const dN = i + 1;
          const tD = (turnos || []).filter(t => {
            const f = new Date(t.fecha_inicio);
            return f.getDate() === dN && f.getMonth() === mesActual.getMonth() && f.getFullYear() === mesActual.getFullYear();
          });
          return (
            <div key={i} style={{ minHeight: '120px', border: '1px solid #eee', padding: '5px' }}>
              <div onClick={() => { setDiaSeleccionado(dN); setTurnoEditando(null); setForm({ paciente_nombre: '', profesional_id: '', tipo_turno: 'consulta', hora: '09:00', observaciones: '', estado: 'pendiente' }); }} style={{ cursor: 'pointer', color: '#007bff' }}>{dN} +</div>
              {tD.map(t => (
                <div key={t.id} onClick={() => { setTurnoEditando(t); setForm(t); setDiaSeleccionado(dN); }} style={{ fontSize: '9px', background: t.estado === 'realizado' ? '#d4edda' : t.estado === 'cancelado' ? '#f8d7da' : '#f8f9fa', padding: '2px', marginTop: '2px', cursor: 'pointer' }}>
                  {t.paciente_nombre} - {t.hora || t.fecha_inicio.split('T')[1]?.substring(0,5)}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* MODAL */}
      {diaSeleccionado && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '20px', width: '320px', borderRadius: '10px', color: '#000' }}>
            <h3>{turnoEditando ? 'Editar Turno' : 'Nuevo Turno'}</h3>
            <input placeholder="Paciente" value={form.paciente_nombre} onChange={e => setForm({...form, paciente_nombre: e.target.value})} style={{width: '100%', marginBottom: 10, padding: '8px'}} />
            <select value={form.profesional_id} onChange={e => setForm({...form, profesional_id: e.target.value})} style={{width: '100%', marginBottom: 10, padding: '8px'}}>
              <option value="">Seleccionar Profesional...</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: 15 }}>
              <select value={form.hora} onChange={e => setForm({...form, hora: e.target.value})} style={{padding: '8px'}}>
                {generarHorarios().map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <input placeholder="Manual (HH:MM)" value={form.hora} onChange={e => setForm({...form, hora: e.target.value})} style={{padding: '8px'}} />
            </div>

            <select value={form.estado} onChange={e => setForm({...form, estado: e.target.value})} style={{width: '100%', marginBottom: 10, padding: '8px'}}>
              <option value="pendiente">⏳ Pendiente</option>
              <option value="realizado">✅ Realizado</option>
              <option value="cancelado">❌ Cancelado</option>
            </select>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={guardarTurno} style={{flex: 1, padding: '10px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '5px'}}>GUARDAR</button>
              <button onClick={() => setDiaSeleccionado(null)} style={{flex: 1, padding: '10px', background: '#ccc', border: 'none', borderRadius: '5px'}}>CERRAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AgendaMensualPro;