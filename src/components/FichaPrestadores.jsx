import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function FichaPrestadores({ onVolver, usuario }) {
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

  const [prestadores, setPrestadores] = useState([]);
  const [prestadorSeleccionado, setPrestadorSeleccionado] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [cargandoPrestadores, setCargandoPrestadores] = useState(false);
  const [cargandoMovimientos, setCargandoMovimientos] = useState(false);

  // Estados para modales/formularios de transacción
  const [modalAbierto, setModalAbierto] = useState(null); // 'pago', 'gasto', 'ajuste'
  const [fechaTx, setFechaTx] = useState('');
  const [montoTx, setMontoTx] = useState('');
  const [conceptoTx, setConceptoTx] = useState('');
  const [observacionTx, setObservacionTx] = useState('');
  const [tipoAjuste, setTipoAjuste] = useState('credito'); // 'credito' (haber) o 'debito' (debe)
  const [procesandoTx, setProcesandoTx] = useState(false);

  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  useEffect(() => {
    cargarPrestadores();
  }, []);

  useEffect(() => {
    if (prestadorSeleccionado) {
      cargarMovimientos(prestadorSeleccionado.id_prestador);
    }
  }, [prestadorSeleccionado]);

  // Carga inicial de prestadores y cálculo de saldos consolidados
  const cargarPrestadores = async () => {
    setCargandoPrestadores(true);
    try {
      // Obtener todos los prestadores
      const { data: listaP, error: errorP } = await supabase
        .from('prestadores_motor')
        .select('*')
        .order('nombre_prestador', { ascending: true });

      if (errorP) throw errorP;

      // Obtener todos los movimientos consolidados para calcular saldos (paginado para superar límite de 1000)
      let listaMovs = [];
      let from = 0;
      let to = 999;
      let keepFetching = true;
      
      while (keepFetching) {
        const { data, error } = await supabase
          .from('movprestadores_motor')
          .select('id_prestador, debe, haber')
          .range(from, to);
          
        if (error) throw error;
        listaMovs = listaMovs.concat(data || []);
        
        if (!data || data.length < 1000) {
          keepFetching = false;
        } else {
          from += 1000;
          to += 1000;
        }
      }

      // Mapear saldos
      const saldosMapa = {};
      (listaMovs || []).forEach(m => {
        const id = m.id_prestador;
        const debeVal = parsearDecimal(m.debe);
        const haberVal = parsearDecimal(m.haber);
        if (!saldosMapa[id]) {
          saldosMapa[id] = 0;
        }
        saldosMapa[id] += (haberVal - debeVal);
      });

      const prestadoresConSaldos = (listaP || []).map(p => {
        let saldoVal = saldosMapa[p.id_prestador] || 0;
        if (Math.abs(saldoVal) < 100) {
          saldoVal = 0;
        }
        return {
          ...p,
          saldoConsolidado: saldoVal
        };
      });

      setPrestadores(prestadoresConSaldos);

      // Si había uno seleccionado, actualizar su saldo de referencia
      if (prestadorSeleccionado) {
        const actualizado = prestadoresConSaldos.find(p => p.id_prestador === prestadorSeleccionado.id_prestador);
        if (actualizado) setPrestadorSeleccionado(actualizado);
      }
    } catch (error) {
      console.error("Error al cargar prestadores:", error);
      mostrarAlerta("Error al cargar listado de profesionales: " + error.message, "error");
    } finally {
      setCargandoPrestadores(false);
    }
  };

  // Cargar movimientos detallados del prestador seleccionado
  const cargarMovimientos = async (idPrestador) => {
    setCargandoMovimientos(true);
    try {
      const { data, error } = await supabase
        .from('movprestadores_motor')
        .select('*')
        .eq('id_prestador', idPrestador)
        .order('fecha', { ascending: true });

      if (error) throw error;

      // Calcular saldo acumulado cronológicamente
      let saldoAcumulado = 0;
      const movimientosConSaldo = (data || []).map(m => {
        const debe = parsearDecimal(m.debe);
        const haber = parsearDecimal(m.haber);
        saldoAcumulado += (haber - debe);
        return {
          ...m,
          saldoAcumulado: saldoAcumulado
        };
      });

      // Mostramos los más recientes primero en la tabla
      setMovimientos(movimientosConSaldo.reverse());
    } catch (error) {
      console.error("Error al cargar movimientos:", error);
      mostrarAlerta("Error al cargar la cuenta corriente.", "error");
    } finally {
      setCargandoMovimientos(false);
    }
  };

  const manejarDescargaExcel = (movs, nombrePrestador) => {
    // Usamos directamente los movimientos tal como se muestran en pantalla (orden descendiente: lo más nuevo arriba)
    const BOM = "\uFEFF";
    let csv = "sep=;\n";
    csv += `Historial Completo - Profesional: ${nombrePrestador}\n\n`;
    csv += "Fecha;Concepto;Acuerdo;Debe ($);Haber ($);Saldo Acumulado ($)\r\n";

    movs.forEach(m => {
      const valDebe = parsearDecimal(m.debe);
      const valHaber = parsearDecimal(m.haber);

      const fecha = m.fecha ? new Date(m.fecha + 'T00:00:00').toLocaleDateString('es-AR') : 'S/D';
      const concepto = (m.concepto || '').replace(/;/g, ',');
      const acuerdo = (m.acuerdo || '-').replace(/;/g, ',');
      const debeStr = valDebe > 0 ? valDebe.toFixed(2).replace('.', ',') : '';
      const haberStr = valHaber > 0 ? valHaber.toFixed(2).replace('.', ',') : '';
      const saldoStr = (m.saldoAcumulado !== undefined ? m.saldoAcumulado : 0).toFixed(2).replace('.', ',');
      
      csv += `${fecha};${concepto};${acuerdo};${debeStr};${haberStr};${saldoStr}\r\n`;
    });

    // Descargar el archivo
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Historico_Completo_${nombrePrestador.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const mostrarAlerta = (texto, tipo) => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
  };

  const abrirFormulario = (tipo) => {
    setModalAbierto(tipo);
    setFechaTx(localStorage.getItem('crin_fecha_trabajo_simulada') || new Date().toISOString().split('T')[0]);
    setMontoTx('');
    setObservacionTx('');
    
    if (tipo === 'pago') {
      setConceptoTx('Pago a Prestador');
    } else if (tipo === 'gasto') {
      setConceptoTx('Gasto del Prestador');
    } else {
      setConceptoTx('Ajuste de Cuenta');
      setTipoAjuste('credito');
    }
  };

  const normalizarRol = (r) => {
    if (!r) return '';
    return String(r)
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  };

  // Confirmar y guardar la transacción en la base de datos
  const confirmarTransaccion = async () => {
    const montoNum = parseFloat(montoTx);
    if (isNaN(montoNum) || montoNum <= 0) {
      alert("Por favor ingrese un importe válido mayor a 0.");
      return;
    }
    if (!conceptoTx.trim()) {
      alert("Por favor especifique el concepto de la transacción.");
      return;
    }

    setProcesandoTx(true);
    try {
      let debeInsert = '0';
      let haberInsert = '0';

      if (modalAbierto === 'pago') {
        debeInsert = montoNum.toString();
      } else if (modalAbierto === 'gasto') {
        debeInsert = montoNum.toString();
      } else if (modalAbierto === 'ajuste') {
        if (tipoAjuste === 'credito') {
          haberInsert = montoNum.toString();
        } else {
          debeInsert = montoNum.toString();
        }
      }

      const nuevoMovimiento = {
        id_prestador: prestadorSeleccionado.id_prestador,
        fecha: fechaTx,
        concepto: conceptoTx + (observacionTx ? ` (${observacionTx})` : ''),
        debe: debeInsert,
        haber: haberInsert,
        saldo: '0.00',
        usuario: usuario || 'Sistema',
        acuerdo: 'Ajuste Manual'
      };

      const { error } = await supabase
        .from('movprestadores_motor')
        .insert([nuevoMovimiento]);

      if (error) throw error;

      mostrarAlerta("Transacción registrada con éxito.", "exito");
      setModalAbierto(null);
      
      await cargarPrestadores();
      await cargarMovimientos(prestadorSeleccionado.id_prestador);

    } catch (error) {
      console.error("Error al registrar transacción:", error);
      alert("Error al registrar transacción: " + error.message);
    } finally {
      setProcesandoTx(false);
    }
  };

  const totalHaber = movimientos.reduce((acc, m) => acc + parsearDecimal(m.haber), 0);
  const totalDebe = movimientos.reduce((acc, m) => acc + parsearDecimal(m.debe), 0);
  const saldoFinal = totalHaber - totalDebe;

  return (
    <div style={{ background: '#ffffff', padding: '30px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', fontFamily: 'Segoe UI, system-ui, sans-serif', color: '#1e293b' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '18px', marginBottom: '25px' }}>
        <div>
          <h2 style={{ color: '#0f172a', margin: 0, fontSize: '22px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🩺💼 Ficha Integral de Prestadores
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Gestioná honorarios, pagos, gastos y saldos corrientes de los profesionales.</p>
        </div>
        <button
          onClick={onVolver}
          style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#475569', transition: 'background 0.2s' }}
          onMouseOver={(e) => e.target.style.background = '#e2e8f0'}
          onMouseOut={(e) => e.target.style.background = '#f1f5f9'}
        >
          ← Volver al Menú
        </button>
      </div>

      {mensaje.texto && (
        <div style={{
          padding: '12px 20px',
          borderRadius: '8px',
          marginBottom: '20px',
          fontSize: '14px',
          fontWeight: '500',
          backgroundColor: mensaje.tipo === 'exito' ? '#dcfce7' : '#fee2e2',
          color: mensaje.tipo === 'exito' ? '#15803d' : '#b91c1c',
          border: `1px solid ${mensaje.tipo === 'exito' ? '#bbf7d0' : '#fecaca'}`
        }}>
          {mensaje.texto}
        </div>
      )}

      <div style={{ marginBottom: '25px', background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#475569', marginBottom: '8px' }}>
          Seleccione un Profesional de la lista:
        </label>
        {cargandoPrestadores ? (
          <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>Cargando profesionales...</p>
        ) : (
          <select
            value={prestadorSeleccionado?.id_prestador || ''}
            onChange={(e) => {
              const p = prestadores.find(x => String(x.id_prestador) === String(e.target.value));
              setPrestadorSeleccionado(p || null);
            }}
            style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '15px', background: '#fff', fontWeight: '600', color: '#0f172a' }}
          >
            <option value="">-- Seleccionar Prestador --</option>
            {prestadores.map(p => (
              <option key={p.id_prestador} value={p.id_prestador}>
                {p.nombre_prestador} {p.especialidad ? `(${p.especialidad})` : ''} - Saldo: ${p.saldoConsolidado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </option>
            ))}
          </select>
        )}
      </div>

      {prestadorSeleccionado && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '25px' }}>
            
            <div style={{ padding: '20px', borderRadius: '12px', background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', border: '1px solid #bfdbfe', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Saldo Final Corriente
              </span>
              <span style={{ fontSize: '24px', fontWeight: '800', color: saldoFinal >= 0 ? '#15803d' : '#b91c1c', marginTop: '6px' }}>
                ${saldoFinal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
              <span style={{ fontSize: '11px', color: '#60a5fa', marginTop: '4px' }}>
                Haber (Acumulado) - Debe (Pagado)
              </span>
            </div>

            <div style={{ padding: '20px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>
                Total Honorarios (Haber)
              </span>
              <span style={{ display: 'block', fontSize: '20px', fontWeight: 'bold', color: '#0f172a', marginTop: '6px' }}>
                ${totalHaber.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '4px' }}>
                Sesiones validadas + Ajustes de crédito
              </span>
            </div>

            <div style={{ padding: '20px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>
                Total Pagado / Gastos (Debe)
              </span>
              <span style={{ display: 'block', fontSize: '20px', fontWeight: 'bold', color: '#0f172a', marginTop: '6px' }}>
                ${totalDebe.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '4px' }}>
                Adelantos + Liquidaciones + Ajustes de débito
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '15px', marginBottom: '30px', background: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <button
              onClick={() => abrirFormulario('pago')}
              style={{ flex: 1, padding: '12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.2s' }}
              onMouseOver={(e) => e.target.style.background = '#059669'}
              onMouseOut={(e) => e.target.style.background = '#10b981'}
            >
              💵 Registrar Pago (al Haber)
            </button>

            <button
              onClick={() => abrirFormulario('gasto')}
              style={{ flex: 1, padding: '12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.2s' }}
              onMouseOver={(e) => e.target.style.background = '#dc2626'}
              onMouseOut={(e) => e.target.style.background = '#ef4444'}
            >
              📉 Registrar Gasto (al Debe)
            </button>

            <button
              onClick={() => abrirFormulario('ajuste')}
              style={{ flex: 1, padding: '12px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.2s' }}
              onMouseOver={(e) => e.target.style.background = '#d97706'}
              onMouseOut={(e) => e.target.style.background = '#f59e0b'}
            >
              ⚙️ Registrar Ajuste
            </button>
          </div>

          {modalAbierto && (
            <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '12px', border: '1px solid #cbd5e1', marginBottom: '30px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: '10px', marginBottom: '15px' }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#0f172a' }}>
                  {modalAbierto === 'pago' && '💵 Formulario de Pago a Prestador'}
                  {modalAbierto === 'gasto' && '📉 Formulario de Gasto de Prestador'}
                  {modalAbierto === 'ajuste' && '⚙️ Formulario de Ajuste Manual'}
                </h4>
                <button onClick={() => setModalAbierto(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Monto ($) *</label>
                  <input
                    type="number"
                    value={montoTx}
                    onChange={(e) => setMontoTx(e.target.value)}
                    placeholder="Ej: 45000"
                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Fecha *</label>
                  <input
                    type="date"
                    value={fechaTx}
                    onChange={(e) => setFechaTx(e.target.value)}
                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                  />
                </div>
              </div>

              {modalAbierto === 'ajuste' && (
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Tipo de Ajuste *</label>
                  <select
                    value={tipoAjuste}
                    onChange={(e) => setTipoAjuste(e.target.value)}
                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', background: '#fff' }}
                  >
                    <option value="credito">Crédito (Suma al Haber)</option>
                    <option value="debito">Débito (Resta al Debe)</option>
                  </select>
                </div>
              )}

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Concepto *</label>
                <input
                  type="text"
                  value={conceptoTx}
                  onChange={(e) => setConceptoTx(e.target.value)}
                  placeholder="Ej: Liquidación quincenal, Material didáctico, etc."
                  style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Nota / Detalle Adicional</label>
                <input
                  type="text"
                  value={observacionTx}
                  onChange={(e) => setObservacionTx(e.target.value)}
                  placeholder="Opcional..."
                  style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  onClick={() => setModalAbierto(null)}
                  disabled={procesandoTx}
                  style={{ padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarTransaccion}
                  disabled={procesandoTx}
                  style={{
                    padding: '8px 20px',
                    background: modalAbierto === 'pago' ? '#10b981' : modalAbierto === 'gasto' ? '#ef4444' : '#f59e0b',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '600'
                  }}
                >
                  {procesandoTx ? 'Guardando...' : 'Confirmar Registro'}
                </button>
              </div>
            </div>
          )}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ fontSize: '16px', color: '#0f172a', fontWeight: 'bold', margin: 0 }}>
                📋 Extracto de Cuenta Corriente (Completo)
              </h3>
              {movimientos.length > 0 && (
                <button
                  onClick={() => manejarDescargaExcel(movimientos, prestadorSeleccionado.nombre_prestador)}
                  style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  📥 Descargar Liquidación (Excel)
                </button>
              )}
            </div>
            {cargandoMovimientos ? (
              <p style={{ fontSize: '14px', color: '#64748b' }}>Cargando extracto...</p>
            ) : movimientos.length === 0 ? (
              <p style={{ color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
                Este profesional no registra movimientos contables en su cuenta corriente.
              </p>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', background: '#fff' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                      <th style={{ padding: '12px 10px' }}>Fecha</th>
                      <th style={{ padding: '12px 10px' }}>Concepto</th>
                      <th style={{ padding: '12px 10px' }}>Acuerdo / Ref</th>
                      <th style={{ padding: '12px 10px', textAlign: 'right' }}>Debe (Pagos/Gastos)</th>
                      <th style={{ padding: '12px 10px', textAlign: 'right' }}>Haber (Honorarios)</th>
                      <th style={{ padding: '12px 10px', textAlign: 'right' }}>Saldo Acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map((m, idx) => {
                      const valDebe = parsearDecimal(m.debe);
                      const valHaber = parsearDecimal(m.haber);
                      return (
                        <tr key={m.id_mov || idx} style={{ borderBottom: '1px solid #e2e8f0', transition: 'background 0.15s' }}>
                          <td style={{ padding: '10px', whiteSpace: 'nowrap', fontWeight: '500', color: '#475569' }}>
                            {m.fecha ? new Date(m.fecha + 'T00:00:00').toLocaleDateString('es-AR') : 'S/F'}
                          </td>
                          <td style={{ padding: '10px', color: '#1e293b', fontWeight: '600' }}>
                            {m.concepto || 'S/D'}
                          </td>
                          <td style={{ padding: '10px', color: '#64748b' }}>
                            <span style={{ fontSize: '11px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                              {m.acuerdo || '-'}
                            </span>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right', color: valDebe > 0 ? '#b91c1c' : '#94a3b8', fontWeight: '600' }}>
                            {valDebe > 0 ? `$${valDebe.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right', color: valHaber > 0 ? '#15803d' : '#94a3b8', fontWeight: '600' }}>
                            {valHaber > 0 ? `$${valHaber.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right', color: m.saldoAcumulado >= 0 ? '#15803d' : '#b91c1c', fontWeight: 'bold' }}>
                            ${m.saldoAcumulado.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      
    </div>
  );
}