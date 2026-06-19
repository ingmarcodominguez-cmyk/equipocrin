import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient'; // Ajusta la ruta a tu cliente de supabase

const PanelDireccion = () => {
  const [pacientes, setPacientes] = useState([]);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [saldo, setSaldo] = useState(0);

  // 1. Cargar lista de pacientes para el buscador
  useEffect(() => {
    const fetchPacientes = async () => {
      const { data } = await supabase.from('pacientes').select('id, nombre');
      setPacientes(data || []);
    };
    fetchPacientes();
  }, []);

  // 2. Cargar movimientos cuando se elige un paciente
  const seleccionarPaciente = async (id) => {
    const paciente = pacientes.find(p => p.id === id);
    setPacienteSeleccionado(paciente);

    const { data } = await supabase
      .from('movimientos')
      .select('*')
      .eq('paciente_id', id);

    setMovimientos(data || []);
    
    // Calcular saldo total
    const total = data.reduce((acc, mov) => acc + (mov.monto || 0), 0);
    setSaldo(total);
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold">Buscador de Pacientes</h2>
      <select onChange={(e) => seleccionarPaciente(e.target.value)} className="border p-2">
        <option value="">Seleccione un paciente...</option>
        {pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>

      {pacienteSeleccionado && (
        <div className="mt-6">
          <h3 className="font-bold">Saldo Total: ${saldo}</h3>
          <button 
            onClick={() => console.log(movimientos)} 
            className="bg-blue-500 text-white p-2 mt-2"
          >
            Ver Resumen Completo
          </button>
        </div>
      )}
    </div>
  );
};

export default PanelDireccion;