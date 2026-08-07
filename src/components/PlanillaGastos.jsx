import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';

// Función para obtener la fecha de trabajo simulada o real en formato local YYYY-MM-DD
const getTodayLocal = () => {
  const sim = localStorage.getItem('crin_fecha_trabajo_simulada');
  if (sim) return sim;
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function PlanillaGastos({ onVolver, usuario }) {
  const [gastos, setGastos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [necesitaTabla, setNecesitaTabla] = useState(false);
  const [usarLocal, setUsarLocal] = useState(false);

  // Estados de Filtros
  const hoyStr = getTodayLocal();
  const [anioFiltro, setAnioFiltro] = useState(hoyStr.split('-')[0]);
  const [mesFiltro, setMesFiltro] = useState(hoyStr.split('-')[1]);
  const [filtroBusqueda, setFiltroBusqueda] = useState('');

  // Estados del Formulario
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoGastoId, setEditandoGastoId] = useState(null);
  const [form, setForm] = useState({
    fecha: hoyStr,
    concepto: 'Artículos de Limpieza',
    conceptoCustom: '',
    importe: '',
    observaciones: ''
  });

  // Estado para la simulación de división
  const [cantProfesionales, setCantProfesionales] = useState('5');

  // Conceptos predefinidos
  const conceptosPredefinidos = [
    'Artículos de Limpieza',
    'Papelería Comercial',
    'Imprenta',
    'Agua',
    'CISI',
    'Personal de Limpieza',
    'Alquiler / Expensas',
    'Luz',
    'Gas',
    'Mantenimiento',
    'Otros'
  ];

  // Años disponibles en el filtro
  const aniosDisponibles = ['2025', '2026', '2027', '2028'];
  const mesesNombres = [
    { value: '01', label: 'Enero' },
    { value: '02', label: 'Febrero' },
    { value: '03', label: 'Marzo' },
    { value: '04', label: 'Abril' },
    { value: '05', label: 'Mayo' },
    { value: '06', label: 'Junio' },
    { value: '07', label: 'Julio' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Septiembre' },
    { value: '10', label: 'Octubre' },
    { value: '11', label: 'Noviembre' },
    { value: '12', label: 'Diciembre' }
  ];

  useEffect(() => {
    chequearYListar();
  }, [usarLocal]);

  // Verificar la existencia de la tabla en Supabase
  const chequearYListar = async () => {
    setCargando(true);
    if (usarLocal) {
      cargarGastosLocal();
      setCargando(false);
      return;
    }

    try {
      const { error } = await supabase.from('gastos_equipo').select('id').limit(1);
      if (error && (error.message.includes('Could not find the table') || error.code === 'PGRST202')) {
        setNecesitaTabla(true);
      } else {
        setNecesitaTabla(false);
        await cargarGastosDB();
      }
    } catch (err) {
      console.error('Error de conexión a la tabla:', err);
      setNecesitaTabla(true);
    } finally {
      setCargando(false);
    }
  };

  // Cargar de base de datos
  const cargarGastosDB = async () => {
    const { data, error } = await supabase
      .from('gastos_equipo')
      .select('*')
      .order('fecha', { ascending: false });
    if (!error && data) {
      setGastos(data);
    }
  };

  // Cargar de localStorage
  const cargarGastosLocal = () => {
    const local = localStorage.getItem('crin_gastos_local');
    if (local) {
      setGastos(JSON.parse(local));
    } else {
      setGastos([]);
    }
  };

  // Guardar Gasto (Agregar o Editar)
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.fecha || !form.importe) {
      alert('Por favor completa la fecha y el importe.');
      return;
    }

    const valorImporte = parseFloat(form.importe.replace(',', '.'));
    if (isNaN(valorImporte) || valorImporte <= 0) {
      alert('Ingresá un importe numérico válido y mayor a cero.');
      return;
    }

    const conceptoFinal = form.concepto === 'Otros' ? form.conceptoCustom.trim() : form.concepto;
    if (!conceptoFinal) {
      alert('Ingresá el concepto del gasto.');
      return;
    }

    const gastoData = {
      fecha: form.fecha,
      concepto: conceptoFinal,
      importe: valorImporte,
      observaciones: form.observaciones ? form.observaciones.trim() : '',
      usuario: usuario || 'Admin'
    };

    try {
      if (usarLocal) {
        // Lógica local
        let nuevosGastos = [...gastos];
        if (editandoGastoId) {
          nuevosGastos = nuevosGastos.map(g => g.id === editandoGastoId ? { ...g, ...gastoData } : g);
        } else {
          const nuevoGastoLocal = {
            id: Date.now(),
            ...gastoData,
            fecha_registro: new Date().toISOString()
          };
          nuevosGastos = [nuevoGastoLocal, ...nuevosGastos];
        }
        localStorage.setItem('crin_gastos_local', JSON.stringify(nuevosGastos));
        setGastos(nuevosGastos);
      } else {
        // Lógica Supabase
        if (editandoGastoId) {
          const { error } = await supabase
            .from('gastos_equipo')
            .update(gastoData)
            .eq('id', editandoGastoId);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('gastos_equipo')
            .insert([gastoData]);
          if (error) throw error;
        }
        await cargarGastosDB();
      }

      alert(editandoGastoId ? '¡Gasto editado con éxito!' : '¡Gasto registrado con éxito!');
      cerrarModalForm();
    } catch (err) {
      alert('Error al guardar el gasto: ' + err.message);
    }
  };

  // Borrar Gasto
  const handleBorrar = async (id) => {
    if (!window.confirm('¿Seguro que deseas eliminar este registro de gasto?')) return;

    try {
      if (usarLocal) {
        const nuevosGastos = gastos.filter(g => g.id !== id);
        localStorage.setItem('crin_gastos_local', JSON.stringify(nuevosGastos));
        setGastos(nuevosGastos);
      } else {
        const { error } = await supabase
          .from('gastos_equipo')
          .delete()
          .eq('id', id);
        if (error) throw error;
        await cargarGastosDB();
      }
      alert('Registro eliminado.');
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    }
  };

  // Abrir modal para editar
  const iniciarEdicion = (g) => {
    setEditandoGastoId(g.id);
    const esPredefinido = conceptosPredefinidos.includes(g.concepto);
    setForm({
      fecha: g.fecha,
      concepto: esPredefinido ? g.concepto : 'Otros',
      conceptoCustom: esPredefinido ? '' : g.concepto,
      importe: String(g.importe),
      observaciones: g.observaciones || ''
    });
    setModalAbierto(true);
  };

  const cerrarModalForm = () => {
    setModalAbierto(false);
    setEditandoGastoId(null);
    setForm({
      fecha: hoyStr,
      concepto: 'Artículos de Limpieza',
      conceptoCustom: '',
      importe: '',
      observaciones: ''
    });
  };

  // Filtrado de gastos para el período seleccionado
  const gastosFiltrados = gastos.filter(g => {
    if (!g.fecha) return false;
    const [year, month] = g.fecha.split('-');
    const coincidePeriodo = year === anioFiltro && month === mesFiltro;

    const coincideBusqueda = filtroBusqueda.trim() === '' || 
      (g.concepto && g.concepto.toLowerCase().includes(filtroBusqueda.toLowerCase())) ||
      (g.observaciones && g.observaciones.toLowerCase().includes(filtroBusqueda.toLowerCase()));

    return coincidePeriodo && coincideBusqueda;
  });

  // Sumatoria total
  const sumaTotal = gastosFiltrados.reduce((acc, g) => acc + parseFloat(g.importe || 0), 0);

  // División simulada
  const divisor = parseInt(cantProfesionales, 10) || 1;
  const totalPorProfesional = sumaTotal / divisor;

  // Formateador de fecha DD/MM/AAAA
  const formatearFecha = (fechaStr) => {
    if (!fechaStr) return '';
    const parts = fechaStr.split('T')[0].split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return fechaStr;
  };

  // Exportar a Excel (CSV)
  const exportarCSV = () => {
    if (gastosFiltrados.length === 0) {
      alert('No hay gastos cargados en este período para exportar.');
      return;
    }

    const headers = ['Fecha', 'Concepto', 'Observaciones', 'Importe ($)', 'Registrado por'];
    const rows = gastosFiltrados.map(g => [
      formatearFecha(g.fecha),
      g.concepto,
      g.observaciones || '',
      g.importe,
      g.usuario
    ]);

    let csvContent = '\uFEFF'; // BOM para soportar caracteres en español (UTF-8)
    csvContent += headers.join(';') + '\n';
    rows.forEach(row => {
      const cleanRow = row.map(val => {
        const text = String(val).replace(/"/g, '""');
        return text.includes(';') || text.includes('\n') ? `"${text}"` : text;
      });
      csvContent += cleanRow.join(';') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const mesNombre = mesesNombres.find(m => m.value === mesFiltro)?.label || mesFiltro;
    link.setAttribute('download', `GASTOS_EQUIPO_${mesNombre.toUpperCase()}_${anioFiltro}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sqlCode = `CREATE TABLE public.gastos_equipo (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  fecha date NOT NULL,
  concepto text NOT NULL,
  importe numeric(12, 2) NOT NULL,
  observaciones text,
  usuario text,
  fecha_registro timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.gastos_equipo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir acceso total a gastos_equipo"
ON public.gastos_equipo
FOR ALL
USING (true)
WITH CHECK (true);`;

  return (
    <div style={{ padding: '5px' }}>
      
      {/* SECCIÓN ADVERTENCIA TABLA BASE DE DATOS */}
      {necesitaTabla && (
        <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: '20px', borderRadius: '16px', marginBottom: '25px', color: '#92400e' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ⚠️ Tabla de Base de Datos Faltante
          </h3>
          <p style={{ margin: '0 0 15px 0', fontSize: '14px', lineHeight: '1.5' }}>
            Para guardar los gastos directamente en tu base de datos y que estén disponibles en todas las computadoras, es necesario crear la tabla <strong>gastos_equipo</strong> en Supabase.
          </p>
          
          <div style={{ position: 'relative', marginBottom: '15px' }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#b45309', display: 'block', marginBottom: '4px' }}>CÓDIGO SQL A EJECUTAR EN SUPABASE:</label>
            <pre style={{ background: '#1e293b', color: '#38bdf8', padding: '15px', borderRadius: '10px', fontSize: '12px', overflowX: 'auto', margin: 0, fontFamily: 'monospace' }}>
              {sqlCode}
            </pre>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button 
              onClick={() => setUsarLocal(true)}
              style={{ background: '#b45309', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
            >
              Usar en Modo Simulado (Guardado Local)
            </button>
            <span style={{ fontSize: '12px', color: '#b45309' }}>
              * Los datos se guardarán en esta computadora hasta que configures Supabase.
            </span>
          </div>
        </div>
      )}

      {/* CABECERA PRINCIPAL */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ margin: 0, fontSize: '26px', color: '#0f766e', fontWeight: '800' }}>🏢 Planilla de Gastos del Equipo</h2>
            {usarLocal && (
              <span style={{ fontSize: '11px', background: '#f59e0b', color: '#fff', padding: '2px 8px', borderRadius: '20px', fontWeight: 'bold' }}>MODO LOCAL</span>
            )}
          </div>
          <p style={{ margin: '5px 0 0 0', color: '#64748b', fontSize: '14px' }}>
            Registrá y visualizá los gastos para el prorrateo de expensas y alquileres de consultorio.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => setModalAbierto(true)}
            style={{ background: '#0f766e', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s', boxShadow: '0 4px 6px -1px rgba(15, 118, 110, 0.2)' }}
            onMouseOver={(e) => { e.currentTarget.style.background = '#0d9488'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = '#0f766e'; }}
          >
            ➕ Cargar Gasto
          </button>
          <button 
            onClick={onVolver}
            style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '12px 20px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Volver
          </button>
        </div>
      </div>

      {/* RESUMEN DE EXPENSAS Y SIMULADOR */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '25px' }}>
        
        {/* CARD 1: TOTAL PERIODO */}
        <div style={{ background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)', border: '1px solid #99f6e4', padding: '25px', borderRadius: '20px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span style={{ fontSize: '13px', color: '#0f766e', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Gastos Totales ({mesesNombres.find(m => m.value === mesFiltro)?.label} {anioFiltro})
          </span>
          <h1 style={{ margin: '10px 0 0 0', fontSize: '36px', color: '#0f766e', fontWeight: '900' }}>
            ${sumaTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h1>
        </div>

        {/* CARD 2: SIMULADOR DE COBRO A PROFESIONALES */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '20px', borderRadius: '20px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.02)', display: 'flex', gap: '15px', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '4px' }}>CANTIDAD DE PROFESIONALES:</label>
            <input 
              type="number" 
              value={cantProfesionales}
              onChange={(e) => setCantProfesionales(e.target.value)}
              min="1"
              style={{ width: '80px', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px', fontWeight: 'bold', textAlign: 'center', outline: 'none' }}
            />
          </div>
          <div style={{ flex: 2, borderLeft: '1px solid #e2e8f0', paddingLeft: '15px' }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', display: 'block' }}>PRORRATEO POR PROFESIONAL:</span>
            <h2 style={{ margin: '4px 0 0 0', fontSize: '24px', color: '#0f766e', fontWeight: '900' }}>
              ${totalPorProfesional.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Total dividido entre {divisor} personas</span>
          </div>
        </div>
      </div>

      {/* FILTROS Y BÚSQUEDA */}
      <div style={{ background: '#ffffff', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '4px' }}>MES:</label>
            <select 
              value={mesFiltro}
              onChange={(e) => setMesFiltro(e.target.value)}
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '14px', outline: 'none', fontWeight: '600' }}
            >
              {mesesNombres.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '4px' }}>AÑO:</label>
            <select 
              value={anioFiltro}
              onChange={(e) => setAnioFiltro(e.target.value)}
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '14px', outline: 'none', fontWeight: '600' }}
            >
              {aniosDisponibles.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '4px' }}>FILTRAR BÚSQUEDA:</label>
            <input 
              type="text" 
              placeholder="Buscar concepto u observaciones..."
              value={filtroBusqueda}
              onChange={(e) => setFiltroBusqueda(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '220px', fontSize: '14px', outline: 'none' }}
            />
          </div>
        </div>

        <div>
          <button 
            onClick={exportarCSV}
            style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            📥 Exportar Período
          </button>
        </div>
      </div>

      {/* GRILLA DE GASTOS */}
      {cargando ? (
        <p style={{ textAlign: 'center', color: '#64748b' }}>Cargando planilla de gastos...</p>
      ) : gastosFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '40px' }}>📁</span>
          <h3 style={{ margin: '15px 0 5px 0', color: '#334155' }}>No se registraron gastos</h3>
          <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>No hay gastos registrados para el mes de {mesesNombres.find(m => m.value === mesFiltro)?.label} del {anioFiltro}.</p>
        </div>
      ) : (
        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '14px 16px', fontWeight: 'bold', color: '#475569', fontSize: '13px' }}>Fecha</th>
                <th style={{ padding: '14px 16px', fontWeight: 'bold', color: '#475569', fontSize: '13px' }}>Concepto</th>
                <th style={{ padding: '14px 16px', fontWeight: 'bold', color: '#475569', fontSize: '13px' }}>Observaciones</th>
                <th style={{ padding: '14px 16px', fontWeight: 'bold', color: '#475569', fontSize: '13px', textAlign: 'right' }}>Importe</th>
                <th style={{ padding: '14px 16px', fontWeight: 'bold', color: '#475569', fontSize: '13px' }}>Cargado por</th>
                <th style={{ padding: '14px 16px', fontWeight: 'bold', color: '#475569', fontSize: '13px', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {gastosFiltrados.map((g) => (
                <tr key={g.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }} onMouseOver={(e) => { e.currentTarget.style.background = '#f8fafc'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'none'; }}>
                  <td style={{ padding: '14px 16px', color: '#334155', fontWeight: '500', whiteSpace: 'nowrap' }}>
                    {formatearFecha(g.fecha)}
                  </td>
                  <td style={{ padding: '14px 16px', color: '#0f766e', fontWeight: 'bold' }}>
                    {g.concepto}
                  </td>
                  <td style={{ padding: '14px 16px', color: '#64748b', maxWidth: '300px', wordWrap: 'break-word' }}>
                    {g.observaciones || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Sin detalles</span>}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 'bold', color: '#0f766e', fontSize: '15px' }}>
                    ${parseFloat(g.importe || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '14px 16px', color: '#475569', fontSize: '13px' }}>
                    {g.usuario || 'Admin'}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      <button 
                        onClick={() => iniciarEdicion(g)}
                        style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#0f766e', fontWeight: 'bold' }}
                      >
                        ✏️ Editar
                      </button>
                      <button 
                        onClick={() => handleBorrar(g.id)}
                        style={{ background: '#fef2f2', border: '1px solid #fee2e2', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#dc2626', fontWeight: 'bold' }}
                      >
                        🗑️ Borrar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL DE CARGA / EDICIÓN */}
      {modalAbierto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 99999 }}>
          <div style={{ background: '#fff', borderRadius: '20px', width: '90%', maxWidth: '500px', padding: '30px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', boxSizing: 'border-box' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', color: '#0f766e', fontWeight: '800' }}>
              {editandoGastoId ? '✏️ Editar Registro de Gasto' : '🏢 Registrar Nuevo Gasto'}
            </h3>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '5px' }}>Fecha del Gasto:</label>
                <input 
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', outline: 'none' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '5px' }}>Concepto del Gasto:</label>
                <select
                  value={form.concepto}
                  onChange={(e) => setForm({ ...form, concepto: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', boxSizing: 'border-box', outline: 'none', fontWeight: '600' }}
                >
                  {conceptosPredefinidos.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {form.concepto === 'Otros' && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '5px' }}>Especificar Concepto:</label>
                  <input 
                    type="text"
                    placeholder="Ej: Artículos de limpieza, Pago remis, etc."
                    value={form.conceptoCustom}
                    onChange={(e) => setForm({ ...form, conceptoCustom: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', outline: 'none' }}
                    required
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '5px' }}>Importe ($):</label>
                <input 
                  type="text"
                  placeholder="Ej: 45000"
                  value={form.importe}
                  onChange={(e) => setForm({ ...form, importe: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', outline: 'none', fontSize: '16px', fontWeight: 'bold' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '5px' }}>Observaciones (Opcional):</label>
                <textarea 
                  placeholder="Detalles del gasto..."
                  value={form.observaciones}
                  onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', outline: 'none', height: '80px', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button 
                  type="submit"
                  style={{ flex: 1, background: '#0f766e', color: '#fff', border: 'none', padding: '12px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Guardar
                </button>
                <button 
                  type="button"
                  onClick={cerrarModalForm}
                  style={{ flex: 1, background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '12px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
