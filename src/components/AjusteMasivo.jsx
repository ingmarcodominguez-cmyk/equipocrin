import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';

export default function AjusteMasivo({ onVolver, usuario }) {
  const [pacientes, setPacientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState({ actual: 0, total: 0 });

  // Form states
  const [tipoAjuste, setTipoAjuste] = useState('nota_credito');
  const [importe, setImporte] = useState('');
  const [concepto, setConcepto] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [fechaAjuste, setFechaAjuste] = useState(
    localStorage.getItem('crin_fecha_trabajo_simulada') || new Date().toISOString().split('T')[0]
  );

  // Selection states
  const [seleccionados, setSeleccionados] = useState({}); // { id_paciente: boolean }
  const [filtroTexto, setFiltroTexto] = useState('');

  useEffect(() => {
    async function cargarPacientes() {
      setCargando(true);
      try {
        // Fetch all patients
        const { data, error } = await supabase
          .from('pacientes_motor')
          .select('id_paciente, nombre_apellido, dni, obra_social')
          .order('nombre_apellido', { ascending: true });

        if (error) throw error;
        setPacientes(data || []);

        // Initialize all as unchecked
        const initialSel = {};
        (data || []).forEach(p => {
          initialSel[p.id_paciente] = false;
        });
        setSeleccionados(initialSel);
      } catch (err) {
        console.error("Error al cargar pacientes:", err);
        alert("Error al cargar pacientes: " + err.message);
      } finally {
        setCargando(false);
      }
    }
    cargarPacientes();
  }, []);

  const parsearDecimal = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    
    const str = String(val).replace(/\$/g, '').trim();
    
    if (str.includes(',')) {
      const limpio = str.replace(/\./g, '').replace(',', '.');
      const num = Number(limpio);
      return isNaN(num) ? 0 : num;
    }
    
    if (str.includes('.')) {
      const partes = str.split('.');
      if (partes.length > 2) {
        const limpio = str.replace(/\./g, '');
        const num = Number(limpio);
        return isNaN(num) ? 0 : num;
      }
      
      const decimales = partes[1];
      if (decimales.length === 3) {
        const limpio = str.replace(/\./g, '');
        const num = Number(limpio);
        return isNaN(num) ? 0 : num;
      }
      
      const num = Number(str);
      return isNaN(num) ? 0 : num;
    }
    
    const num = Number(str);
    return isNaN(num) ? 0 : num;
  };

  // Toggle single selection
  const toggleSeleccion = (id) => {
    setSeleccionados(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Filter patients list
  const pacientesFiltrados = pacientes.filter(p => 
    p.nombre_apellido.toLowerCase().includes(filtroTexto.toLowerCase()) ||
    String(p.dni || '').includes(filtroTexto) ||
    String(p.obra_social || '').toLowerCase().includes(filtroTexto.toLowerCase())
  );

  // Toggle all visible patients
  const totalVisibles = pacientesFiltrados.length;
  const seleccionadosVisibles = pacientesFiltrados.filter(p => seleccionados[p.id_paciente]).length;
  const todosVisiblesSeleccionados = totalVisibles > 0 && seleccionadosVisibles === totalVisibles;

  const toggleTodosVisibles = () => {
    const nextState = !todosVisiblesSeleccionados;
    setSeleccionados(prev => {
      const copy = { ...prev };
      pacientesFiltrados.forEach(p => {
        copy[p.id_paciente] = nextState;
      });
      return copy;
    });
  };

  // List of selected patient IDs
  const listaSeleccionados = Object.keys(seleccionados)
    .filter(id => seleccionados[id])
    .map(Number);

  const totalSeleccionados = listaSeleccionados.length;
  const importeNum = parsearDecimal(importe);
  const totalAjusteAcumulado = totalSeleccionados * importeNum;

  // Confirm and run bulk registration
  const ejecutarAjusteMasivo = async () => {
    if (totalSeleccionados === 0) {
      alert("Por favor seleccione al menos un paciente.");
      return;
    }
    if (isNaN(importeNum) || importeNum <= 0) {
      alert("Por favor ingrese un importe válido mayor a 0.");
      return;
    }
    if (!concepto.trim()) {
      alert("Por favor complete el concepto del ajuste.");
      return;
    }

    const confirmar = window.confirm(
      `¿Está seguro de que desea crear masivamente una Nota de ${tipoAjuste === 'nota_credito' ? 'Crédito' : 'Débito'} de $${importeNum.toLocaleString('es-AR')} para ${totalSeleccionados} pacientes?\n\nEsto impactará directamente en sus cuentas corrientes.`
    );
    if (!confirmar) return;

    setProcesando(true);
    setProgreso({ actual: 0, total: totalSeleccionados });

    const creadosExitosamente = [];

    try {
      // 1. Get the starting id_movimiento and next id_deuda (for debit notes)
      const { data: maxMovData, error: errMax } = await supabase
        .from('movimientoscuenta_motor')
        .select('id_movimiento')
        .order('id_movimiento', { ascending: false })
        .limit(1);

      if (errMax) throw errMax;
      let nextIdMovimiento = (maxMovData && maxMovData[0]?.id_movimiento ? parseInt(maxMovData[0].id_movimiento, 10) : 0) + 1;

      const { data: maxDeudaData, error: errMaxDeuda } = await supabase
        .from('movimientoscuenta_motor')
        .select('id_deuda')
        .order('id_deuda', { ascending: false })
        .limit(1);

      if (errMaxDeuda) throw errMaxDeuda;
      let nextIdDeuda = (maxDeudaData && maxDeudaData[0]?.id_deuda ? parseInt(maxDeudaData[0].id_deuda, 10) : 0) + 1;

      // 1.5 Fetch ALL historical movements of the selected patients to compute their outstanding debts in-memory
      const { data: allMovs, error: errMovs } = await supabase
        .from('movimientoscuenta_motor')
        .select('*')
        .in('id_paciente', listaSeleccionados);

      if (errMovs) throw errMovs;

      // 2. Loop over patients and save one by one (to ensure ID sequencing)
      for (let i = 0; i < listaSeleccionados.length; i++) {
        const idPaciente = listaSeleccionados[i];
        const pacObj = pacientes.find(p => p.id_paciente === idPaciente);
        const nombrePaciente = pacObj ? pacObj.nombre_apellido : `Paciente ID: ${idPaciente}`;
        const obraSocial = pacObj ? pacObj.obra_social || 'S/D' : 'S/D';

        setProgreso({ actual: i + 1, total: totalSeleccionados });

        // A. Insert in ajustes_motor
        const registroAjuste = {
          id_paciente: idPaciente,
          fecha_ajuste: fechaAjuste,
          tipo_ajuste: tipoAjuste,
          importe: importeNum.toString(),
          concepto: concepto.trim(),
          observacion: observaciones.trim() || '',
          usuario: usuario || 'Sistema'
        };

        const { error: errAjuste } = await supabase
          .from('ajustes_motor')
          .insert([registroAjuste]);

        if (errAjuste) {
          console.error(`Error al registrar ajuste para paciente ID ${idPaciente}:`, errAjuste);
          continue; // skip or alert, we choose to log and continue
        }

        // B. Generate movements in movimientoscuenta_motor
        if (tipoAjuste === 'nota_debito') {
          // A Debit Note is a new charge/invoice, so it behaves like a new pending debt.
          // Assign it a brand new id_deuda!
          const nuevoMovimiento = {
            id_movimiento: nextIdMovimiento,
            id_paciente: idPaciente,
            id_acuerdo: null,
            id_deuda: nextIdDeuda,
            fecha_movimiento: fechaAjuste,
            fecha_cuota_origen: fechaAjuste,
            fecha_vencimiento: fechaAjuste,
            tipo_movimiento: 'ajuste',
            subtipo: 'nota_debito',
            concepto: `N.Débito: ${concepto.trim()}`,
            debe: importeNum.toString(),
            haber: '0',
            saldo: '0.00',
            usuario: usuario || 'Sistema'
          };

          const { error: errMov } = await supabase
            .from('movimientoscuenta_motor')
            .insert([nuevoMovimiento]);

          if (errMov) {
            console.error(`Error al registrar movimiento para paciente ID ${idPaciente}:`, errMov);
            continue;
          }

          creadosExitosamente.push({
            id_movimiento: nextIdMovimiento,
            nombre_paciente: nombrePaciente,
            obra_social: obraSocial,
            tipo: 'Nota de Débito',
            monto: importeNum,
            concepto: concepto.trim()
          });

          nextIdMovimiento++;
          nextIdDeuda++;

        } else {
          // A Credit Note is an entry in the 'haber' that reduces the client's balance.
          // To make it clear outstanding debts, we distribute it using FIFO logic among their current pending debts.
          const pacienteMovs = (allMovs || []).filter(m => m.id_paciente === idPaciente);
          const mapaSaldos = {};

          pacienteMovs.forEach(m => {
            if (!m.id_deuda) return;
            if (!mapaSaldos[m.id_deuda]) {
              mapaSaldos[m.id_deuda] = {
                id_deuda: m.id_deuda,
                id_acuerdo: m.id_acuerdo,
                concepto: m.concepto || `Deuda #${m.id_deuda}`,
                debe: 0,
                haber: 0,
                fecha_vencimiento: m.fecha_vencimiento || m.fecha_movimiento || ''
              };
            }
            mapaSaldos[m.id_deuda].debe += parsearDecimal(m.debe);
            mapaSaldos[m.id_deuda].haber += parsearDecimal(m.haber);
          });

          // Filter only active pending debts
          const deudasPendientes = Object.values(mapaSaldos)
            .map(d => ({ ...d, saldoReal: d.debe - d.haber }))
            .filter(d => d.saldoReal > 0.01)
            .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));

          let restante = importeNum;
          const movimientosDeCreditNote = [];

          if (deudasPendientes.length > 0) {
            for (const d of deudasPendientes) {
              if (restante <= 0) break;
              const montoAsignar = Math.min(restante, d.saldoReal);
              if (montoAsignar > 0) {
                movimientosDeCreditNote.push({
                  id_movimiento: nextIdMovimiento,
                  id_paciente: idPaciente,
                  id_acuerdo: d.id_acuerdo,
                  id_deuda: d.id_deuda,
                  fecha_movimiento: fechaAjuste,
                  fecha_cuota_origen: fechaAjuste,
                  fecha_vencimiento: fechaAjuste,
                  tipo_movimiento: 'ajuste',
                  subtipo: 'nota_credito',
                  concepto: `N.Crédito: ${concepto.trim()}`,
                  debe: '0',
                  haber: montoAsignar.toString(),
                  saldo: '0.00',
                  usuario: usuario || 'Sistema'
                });
                restante -= montoAsignar;
                nextIdMovimiento++;
              }
            }
          }

          // If there is still a remaining credit (or no pending debts at all), post it as a general credit
          if (restante > 0) {
            movimientosDeCreditNote.push({
              id_movimiento: nextIdMovimiento,
              id_paciente: idPaciente,
              id_acuerdo: null,
              id_deuda: null,
              fecha_movimiento: fechaAjuste,
              fecha_cuota_origen: fechaAjuste,
              fecha_vencimiento: fechaAjuste,
              tipo_movimiento: 'ajuste',
              subtipo: 'nota_credito',
              concepto: `N.Crédito: ${concepto.trim()}`,
              debe: '0',
              haber: restante.toString(),
              saldo: '0.00',
              usuario: usuario || 'Sistema'
            });
            nextIdMovimiento++;
          }

          // Insert all movements generated for this credit note
          const { error: errMovsInsert } = await supabase
            .from('movimientoscuenta_motor')
            .insert(movimientosDeCreditNote);

          if (errMovsInsert) {
            console.error(`Error al registrar movimientos de crédito para paciente ID ${idPaciente}:`, errMovsInsert);
            continue;
          }

          creadosExitosamente.push({
            id_movimiento: movimientosDeCreditNote[0].id_movimiento,
            nombre_paciente: nombrePaciente,
            obra_social: obraSocial,
            tipo: 'Nota de Crédito',
            monto: importeNum,
            concepto: concepto.trim()
          });
        }
      }

      alert(`¡Generación masiva completada!\nSe registraron con éxito ${creadosExitosamente.length} de ${totalSeleccionados} ajustes solicitados.`);
      
      // Auto download spreadsheet of generated adjustments
      if (creadosExitosamente.length > 0) {
        descargarReporteMasivo(creadosExitosamente);
      }

      // Reset selection
      const resetSel = {};
      pacientes.forEach(p => {
        resetSel[p.id_paciente] = false;
      });
      setSeleccionados(resetSel);
      setImporte('');
      setConcepto('');
      setObservaciones('');

    } catch (err) {
      alert("Error general en proceso masivo: " + err.message);
    } finally {
      setProcesando(false);
    }
  };

  // Helper to trigger CSV file download of the bulk adjustments
  const descargarReporteMasivo = (lista) => {
    const encabezados = [
      'Movimiento ID',
      'Paciente',
      'Obra Social',
      'Tipo Ajuste',
      'Importe ($)',
      'Concepto',
      'Fecha Proceso'
    ];

    const filas = lista.map(item => [
      item.id_movimiento,
      item.nombre_paciente,
      item.obra_social,
      item.tipo,
      item.monto.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      item.concepto,
      fechaAjuste
    ]);

    const csvContent = [
      encabezados.join(';'),
      ...filas.map(fila => fila.map(campo => `"${String(campo).replace(/"/g, '""')}"`).join(';'))
    ].join('\r\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_ajustes_masivos_${fechaAjuste}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', background: '#fff', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', color: '#1e293b' }}>
      
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '15px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '28px' }}>📝⚙️</span>
          <h2 style={{ color: '#0f172a', margin: 0, fontSize: '22px', fontWeight: 'bold' }}>Procesamiento de Ajustes Masivos</h2>
        </div>
        <button
          onClick={onVolver}
          disabled={procesando}
          style={{ background: '#64748b', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', transition: 'background 0.2s' }}
          onMouseOver={(e) => e.target.style.background = '#475569'}
          onMouseOut={(e) => e.target.style.background = '#64748b'}
        >
          ← Volver al Menú Principal
        </button>
      </div>

      {procesando && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '15px', marginBottom: '20px', textAlign: 'center' }}>
          <p style={{ fontWeight: 'bold', color: '#1e3a8a', margin: '0 0 10px 0' }}>
            Procesando ajustes masivos... Por favor, no cierre la aplicación.
          </p>
          <div style={{ background: '#e2e8f0', borderRadius: '8px', height: '16px', overflow: 'hidden', maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ background: '#3b82f6', height: '100%', width: `${(progreso.actual / progreso.total) * 100}%`, transition: 'width 0.2s' }} />
          </div>
          <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#1e40af', fontWeight: '600' }}>
            Progreso: {progreso.actual} de {progreso.total} ({Math.round((progreso.actual / progreso.total) * 100)}%)
          </p>
        </div>
      )}

      {/* Grid de Formulario y KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px', marginBottom: '25px' }}>
        
        {/* Formulario de Carga */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '20px' }}>
          <h4 style={{ margin: '0 0 15px 0', color: '#0f172a', fontWeight: 'bold' }}>Configuración del Ajuste</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
            
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Tipo de Ajuste *</label>
              <select
                value={tipoAjuste}
                onChange={(e) => setTipoAjuste(e.target.value)}
                disabled={procesando}
                style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff', fontWeight: 'bold' }}
              >
                <option value="nota_credito">Nota de Crédito (Descuento/A favor)</option>
                <option value="nota_debito">Nota de Débito (Cargo/En contra)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Importe Unitario ($) *</label>
              <input
                type="text"
                placeholder="Ej: 5000"
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                disabled={procesando}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Concepto *</label>
              <input
                type="text"
                placeholder="Ej: Bonificación Especial"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                disabled={procesando}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Fecha de Registro</label>
              <input
                type="date"
                value={fechaAjuste}
                onChange={(e) => setFechaAjuste(e.target.value)}
                disabled={procesando}
                style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
              />
            </div>

          </div>

          <div style={{ marginTop: '15px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Observaciones Generales</label>
            <input
              type="text"
              placeholder="Detalle adicional interno..."
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              disabled={procesando}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
          </div>
        </div>

        {/* Panel de Resumen (KPI) */}
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: '11px', color: '#166534', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.5px' }}>Resumen del Proceso</span>
            <div style={{ marginTop: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '5px' }}>
                <span>Pacientes Seleccionados:</span>
                <span style={{ fontWeight: 'bold' }}>{totalSeleccionados}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '5px' }}>
                <span>Importe por Paciente:</span>
                <span style={{ fontWeight: 'bold' }}>${importeNum.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div style={{ borderTop: '1px solid #bbf7d0', marginTop: '10px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 'bold', color: '#14532d' }}>
                <span>Total Acumulado:</span>
                <span>${totalAjusteAcumulado.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          <button
            onClick={ejecutarAjusteMasivo}
            disabled={procesando || totalSeleccionados === 0 || !importe || !concepto}
            style={{ 
              marginTop: '15px',
              width: '100%', 
              background: tipoAjuste === 'nota_credito' ? '#10b981' : '#dc2626', 
              color: '#fff', 
              border: 'none', 
              padding: '12px', 
              borderRadius: '8px', 
              cursor: 'pointer', 
              fontWeight: 'bold', 
              fontSize: '14px',
              transition: 'background 0.2s',
              opacity: (totalSeleccionados === 0 || !importe || !concepto || procesando) ? 0.6 : 1
            }}
          >
            🚀 Confirmar Ajuste Masivo
          </button>
        </div>

      </div>

      {/* Buscador de Pacientes */}
      <div style={{ marginBottom: '15px' }}>
        <input
          type="text"
          placeholder="🔍 Filtrar pacientes por nombre, DNI u Obra Social..."
          value={filtroTexto}
          onChange={(e) => setFiltroTexto(e.target.value)}
          disabled={procesando}
          style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc' }}
        />
      </div>

      {/* Tabla de Pacientes */}
      {cargando ? (
        <p style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>Cargando listado de pacientes...</p>
      ) : (
        <div style={{ overflowY: 'auto', maxHeight: '400px', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', background: '#fff', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '2px solid #cbd5e1', position: 'sticky', top: 0, zIndex: 5 }}>
                <th style={{ padding: '12px 10px', width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={todosVisiblesSeleccionados}
                    onChange={toggleTodosVisibles}
                    disabled={procesando}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th style={{ padding: '12px 10px' }}>Nombre y Apellido</th>
                <th style={{ padding: '12px 10px' }}>DNI</th>
                <th style={{ padding: '12px 10px' }}>Obra Social</th>
              </tr>
            </thead>
            <tbody>
              {pacientesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                    No se encontraron pacientes que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : (
                pacientesFiltrados.map(p => {
                  const isChecked = !!seleccionados[p.id_paciente];
                  return (
                    <tr 
                      key={p.id_paciente} 
                      onClick={() => !procesando && toggleSeleccion(p.id_paciente)}
                      style={{ 
                        borderBottom: '1px solid #e2e8f0', 
                        background: isChecked ? '#f0fdf4' : '#fff',
                        cursor: 'pointer',
                        transition: 'background 0.1s'
                      }}
                    >
                      <td style={{ padding: '12px 10px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSeleccion(p.id_paciente)}
                          disabled={procesando}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '12px 10px', fontWeight: 'bold', color: isChecked ? '#14532d' : '#0f172a' }}>
                        👤 {p.nombre_apellido}
                      </td>
                      <td style={{ padding: '12px 10px', color: '#475569' }}>
                        {p.dni || 'S/D'}
                      </td>
                      <td style={{ padding: '12px 10px', color: '#475569' }}>
                        {p.obra_social || 'S/D'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
