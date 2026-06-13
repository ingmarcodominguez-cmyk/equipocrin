import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function GestionPacientes() {
  const [aviso, setAviso] = useState(false);
  const [pacientes, setPacientes] = useState([])
  const [editId, setEditId] = useState(null)
  
  // Estados para los campos de fecha separados
  const [dia, setDia] = useState('');
  const [mes, setMes] = useState('');
  const [anio, setAnio] = useState('');

  const [form, setForm] = useState({
    nombre: '', dni: '', domicilio: '', 
    escuela: '', telefono: '', obra_social: '', diagnostico: ''
  })

  useEffect(() => {
    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => {
      setAviso(true);
      setTimeout(() => setAviso(false), 3000);
      window.history.pushState(null, "", window.location.href);
    };
    window.addEventListener('popstate', handlePopState);
    cargarPacientes();
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  async function cargarPacientes() {
    const { data } = await supabase.from('pacientes').select('*').order('nombre', { ascending: true });
    if (data) setPacientes(data);
  }

  const calcularEdad = (fecha) => {
    if (!fecha) return 0;
    const hoy = new Date();
    const nacimiento = new Date(fecha);
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const m = hoy.getMonth() - nacimiento.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
    return edad;
  };

  function iniciarEdicion(p) {
    setEditId(p.id);
    setForm({
      nombre: p.nombre, dni: p.dni, domicilio: p.domicilio, 
      escuela: p.escuela, telefono: p.telefono, obra_social: p.obra_social, diagnostico: p.diagnostico
    });
    // Desglosar fecha YYYY-MM-DD
    if (p.fecha_nacimiento) {
      const [y, m, d] = p.fecha_nacimiento.split('-');
      setAnio(y); setMes(m); setDia(d);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function guardarPaciente() {
    if (!form.nombre || !form.dni || !dia || !mes || !anio) return alert("Nombre, DNI y Fecha de nacimiento son obligatorios");

    const fecha_nacimiento = `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    const edad = calcularEdad(fecha_nacimiento);
    const payload = { ...form, fecha_nacimiento, edad };

    if (editId) {
      const { error } = await supabase.from('pacientes').update(payload).eq('id', editId);
      if (error) return alert("Error: " + error.message);
    } else {
      const { error } = await supabase.from('pacientes').insert([payload]);
      if (error) return alert("Error: " + error.message);
    }

    setForm({ nombre: '', dni: '', domicilio: '', escuela: '', telefono: '', obra_social: '', diagnostico: '' });
    setDia(''); setMes(''); setAnio('');
    setEditId(null);
    cargarPacientes();
  }

  return (
    <div style={{ color: '#fff', padding: '20px', position: 'relative' }}>
      {aviso && (
        <div style={{ position: 'fixed', top: '20px', left: '10%', right: '10%', background: '#ff0055', color: '#fff', padding: '15px', borderRadius: '10px', textAlign: 'center', zIndex: 1000, fontWeight: 'bold' }}>
          ¡Por favor, utiliza el botón 'Volver' de la pantalla!
        </div>
      )}

      <h2 style={{ color: '#00f2ff' }}>{editId ? '✏️ Editando Paciente' : 'Gestión de Pacientes'}</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px', background: '#1a1a1a', padding: '20px', borderRadius: '10px' }}>
        <input placeholder="Nombre Completo" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} style={inputStyle} />
        <input placeholder="DNI" value={form.dni} onChange={e => setForm({...form, dni: e.target.value})} style={inputStyle} />
        
        {/* NUEVOS CAMPOS DE FECHA */}
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
          <input type="number" placeholder="Día" value={dia} onChange={e => setDia(e.target.value)} style={{...inputStyle, width: '30%'}} />
          <input type="number" placeholder="Mes" value={mes} onChange={e => setMes(e.target.value)} style={{...inputStyle, width: '30%'}} />
          <input type="number" placeholder="Año" value={anio} onChange={e => setAnio(e.target.value)} style={{...inputStyle, width: '40%'}} />
        </div>

        <input placeholder="Domicilio" value={form.domicilio} onChange={e => setForm({...form, domicilio: e.target.value})} style={inputStyle} />
        <input placeholder="Escuela" value={form.escuela} onChange={e => setForm({...form, escuela: e.target.value})} style={inputStyle} />
        <input placeholder="Teléfono" value={form.telefono} onChange={e => setForm({...form, telefono: e.target.value})} style={inputStyle} />
        <input placeholder="Obra Social" value={form.obra_social} onChange={e => setForm({...form, obra_social: e.target.value})} style={inputStyle} />
        <input placeholder="Diagnóstico" value={form.diagnostico} onChange={e => setForm({...form, diagnostico: e.target.value})} style={inputStyle} />
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={guardarPaciente} style={btnStyle}>{editId ? 'ACTUALIZAR DATOS' : 'GUARDAR PACIENTE'}</button>
        {editId && <button onClick={() => { setEditId(null); setForm({nombre: '', dni: '', domicilio: '', escuela: '', telefono: '', obra_social: '', diagnostico: ''}); setDia(''); setMes(''); setAnio(''); }} style={{...btnStyle, borderColor: '#666', color: '#ccc'}}>CANCELAR</button>}
      </div>

      <h3 style={{ marginTop: '30px', color: '#00f2ff' }}>Listado de Pacientes</h3>
      <div style={{ overflowX: 'auto', background: '#111', padding: '10px', borderRadius: '10px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#222', textAlign: 'left' }}>
              <th style={{ padding: '12px' }}>Acción</th>
              <th style={{ padding: '12px' }}>Nombre</th>
              <th style={{ padding: '12px' }}>Edad</th>
              <th style={{ padding: '12px' }}>DNI</th>
              <th style={{ padding: '12px' }}>Teléfono</th>
              <th style={{ padding: '12px' }}>Obra Social</th>
            </tr>
          </thead>
          <tbody>
            {pacientes.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '12px' }}><button onClick={() => iniciarEdicion(p)} style={{ background: 'none', border: 'none', color: '#00f2ff', cursor: 'pointer' }}>✏️ Editar</button></td>
                <td style={{ padding: '12px' }}>{p.nombre}</td>
                <td style={{ padding: '12px' }}>{p.edad}</td>
                <td style={{ padding: '12px' }}>{p.dni}</td>
                <td style={{ padding: '12px' }}>{p.telefono}</td>
                <td style={{ padding: '12px' }}>{p.obra_social}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const inputStyle = { padding: '12px', borderRadius: '8px', border: '1px solid #444', background: '#000', color: '#fff', boxSizing: 'border-box' };
const btnStyle = { padding: '15px', background: 'transparent', border: '1px solid #00f2ff', color: '#00f2ff', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' };

export default GestionPacientes;