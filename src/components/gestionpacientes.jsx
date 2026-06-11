import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function GestionPacientes() {
  const [pacientes, setPacientes] = useState([])
  const [form, setForm] = useState({
    nombre: '', dni: '', fecha_nacimiento: '', domicilio: '', 
    escuela: '', telefono: '', obra_social: '', diagnostico: ''
  })

  useEffect(() => {
    cargarPacientes();
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
    const mes = hoy.getMonth() - nacimiento.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
    return edad;
  };

  async function guardarPaciente() {
    if (!form.nombre || !form.dni) return alert("Nombre y DNI son obligatorios");

    const edad = calcularEdad(form.fecha_nacimiento);
    
    const { error } = await supabase.from('pacientes').insert([{
      ...form,
      edad: edad
    }]);

    if (error) {
      alert("Error al guardar: " + error.message);
    } else {
      alert("Paciente registrado con éxito");
      setForm({ nombre: '', dni: '', fecha_nacimiento: '', domicilio: '', escuela: '', telefono: '', obra_social: '', diagnostico: '' });
      cargarPacientes();
    }
  }

  return (
    <div style={{ color: '#fff', padding: '20px' }}>
      <h2 style={{ color: '#00f2ff' }}>Gestión de Pacientes</h2>
      
      {/* Formulario */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '30px', background: '#1a1a1a', padding: '20px', borderRadius: '10px' }}>
        <input placeholder="Nombre Completo" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} style={inputStyle} />
        <input placeholder="DNI" value={form.dni} onChange={e => setForm({...form, dni: e.target.value})} style={inputStyle} />
        <input type="date" value={form.fecha_nacimiento} onChange={e => setForm({...form, fecha_nacimiento: e.target.value})} style={inputStyle} />
        <input placeholder="Domicilio" value={form.domicilio} onChange={e => setForm({...form, domicilio: e.target.value})} style={inputStyle} />
        <input placeholder="Escuela" value={form.escuela} onChange={e => setForm({...form, escuela: e.target.value})} style={inputStyle} />
        <input placeholder="Teléfono" value={form.telefono} onChange={e => setForm({...form, telefono: e.target.value})} style={inputStyle} />
        <input placeholder="Obra Social" value={form.obra_social} onChange={e => setForm({...form, obra_social: e.target.value})} style={inputStyle} />
        <input placeholder="Diagnóstico" value={form.diagnostico} onChange={e => setForm({...form, diagnostico: e.target.value})} style={inputStyle} />
      </div>

      <button onClick={guardarPaciente} style={btnStyle}>GUARDAR PACIENTE</button>

      {/* Tabla completa */}
      <h3 style={{ marginTop: '30px', color: '#00f2ff' }}>Listado de Pacientes</h3>
      <div style={{ overflowX: 'auto', background: '#111', padding: '10px', borderRadius: '10px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#222', textAlign: 'left' }}>
              <th style={{ padding: '12px' }}>Nombre</th>
              <th style={{ padding: '12px' }}>Edad</th>
              <th style={{ padding: '12px' }}>DNI</th>
              <th style={{ padding: '12px' }}>Teléfono</th>
              <th style={{ padding: '12px' }}>Obra Social</th>
              <th style={{ padding: '12px' }}>Diagnóstico</th>
            </tr>
          </thead>
          <tbody>
            {pacientes.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '12px' }}>{p.nombre}</td>
                <td style={{ padding: '12px' }}>{p.edad}</td>
                <td style={{ padding: '12px' }}>{p.dni}</td>
                <td style={{ padding: '12px' }}>{p.telefono}</td>
                <td style={{ padding: '12px' }}>{p.obra_social}</td>
                <td style={{ padding: '12px' }}>{p.diagnostico}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const inputStyle = { padding: '12px', borderRadius: '8px', border: '1px solid #444', background: '#000', color: '#fff' };
const btnStyle = { padding: '15px', background: 'transparent', border: '1px solid #00f2ff', color: '#00f2ff', borderRadius: '8px', cursor: 'pointer', width: '100%', fontWeight: 'bold' };

export default GestionPacientes;