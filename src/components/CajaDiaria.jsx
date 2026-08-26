import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function CajaDiaria({ onVolver, usuario }) {
  const getLocalDateString = () => {
    const fSimulada = localStorage.getItem('crin_fecha_trabajo_simulada');
    if (fSimulada) return fSimulada;
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getTomorrowLocalDateString = () => {
    const fSimulada = localStorage.getItem('crin_fecha_trabajo_simulada');
    const today = fSimulada ? new Date(fSimulada + 'T00:00:00') : new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [movimientos, setMovimientos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroFechaDesde, setFiltroFechaDesde] = useState(getLocalDateString());
  const [filtroFechaHasta, setFiltroFechaHasta] = useState(getLocalDateString());
  
  const setHoy = () => {
    const hoy = getLocalDateString();
    setFiltroFechaDesde(hoy);
    setFiltroFechaHasta(hoy);
  };

  const getFiltroFechaLabel = () => {
    if (filtroFechaDesde === filtroFechaHasta) {
      return filtroFechaDesde ? new Date(filtroFechaDesde + 'T00:00:00').toLocaleDateString('es-AR') : 'S/F';
    }
    return `del ${new Date(filtroFechaDesde + 'T00:00:00').toLocaleDateString('es-AR')} al ${new Date(filtroFechaHasta + 'T00:00:00').toLocaleDateString('es-AR')}`;
  };

  const [modalAbierto, setModalAbierto] = useState(null); // 'ingreso', 'egreso', 'ajuste', o 'cierre'
  const [tipoAjusteCaja, setTipoAjusteCaja] = useState('INGRESO');
  
  // Estados para el formulario de la transacción (Ingreso/Egreso)
  const [fechaTx, setFechaTx] = useState(getLocalDateString());
  const [conceptoTx, setConceptoTx] = useState('');
  const [montoTx, setMontoTx] = useState('');
  const [observacionTx, setObservacionTx] = useState('');
  
  // Estados para el formulario de Cierre/Rendición
  const [saldoRealCierre, setSaldoRealCierre] = useState('');
  const [montoRendidoCierre, setMontoRendidoCierre] = useState('');
  const [turnoCierre, setTurnoCierre] = useState('TARDE');
  const [entregadoPorCierre, setEntregadoPorCierre] = useState(usuario || 'Sistema');
  const [recibidoPorCierre, setRecibidoPorCierre] = useState('DIRECCIÓN');
  const [motivoDifCierre, setMotivoDifCierre] = useState('');
  const [fechaSiguienteApertura, setFechaSiguienteApertura] = useState('');

  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    cargarCaja();
  }, []);

  const cargarCaja = async () => {
    setCargando(true);
    try {
      // Obtener todos los movimientos de caja en efectivo
      const { data, error } = await supabase
        .from('caja_motor')
        .select('*')
        .eq('medio_pago', 'EFECTIVO')
        .order('fecha', { ascending: true })
        .order('id_mov', { ascending: true });

      if (error) throw error;

      // Calcular saldo acumulado secuencialmente
      let saldoAcumulado = 0;
      const movsConSaldo = (data || []).map(m => {
        const imp = parseFloat(m.importe) || 0;
        if (m.tipo === 'INGRESO' || m.tipo === 'APERTURA') {
          saldoAcumulado += imp;
        } else if (m.tipo === 'EGRESO') {
          saldoAcumulado -= imp;
        }
        return {
          ...m,
          saldoCalculado: saldoAcumulado
        };
      });

      // Guardamos la lista ordenada de más reciente a más antiguo para mostrar en la tabla
      setMovimientos(movsConSaldo.reverse());
    } catch (err) {
      console.error("Error al cargar movimientos de caja:", err);
      alert("Error al cargar la caja diaria: " + err.message);
    } finally {
      setCargando(false);
    }
  };

  // Saldo final absoluto de la caja (el saldo del último movimiento registrado)
  const saldoCajaTotal = movimientos.length > 0 ? movimientos[0].saldoCalculado : 0;

  // Obtener fecha de mañana por defecto
  const getTomorrowDate = () => {
    return getTomorrowLocalDateString();
  };

  // Abrir modal de transacción
  const abrirModal = (tipo) => {
    setModalAbierto(tipo);
    setFechaTx(getLocalDateString());
    if (tipo === 'cierre') {
      const actual = saldoCajaTotal.toString();
      setSaldoRealCierre(actual);
      setMontoRendidoCierre(actual); // Por defecto rinde toda la plata
      
      // Auto-detectar turno por la hora actual
      const currentHour = new Date().getHours();
      const defaultTurno = currentHour < 13 ? 'MAÑANA' : 'TARDE';
      setTurnoCierre(defaultTurno);
      
      setEntregadoPorCierre(usuario || 'Sistema');
      setRecibidoPorCierre('DIRECCIÓN');
      setMotivoDifCierre('');
      
      // Si cerramos turno MAÑANA, el siguiente turno (TARDE) abre hoy.
      // Si cerramos turno TARDE/NOCHE, el siguiente turno (MAÑANA) abre mañana.
      if (defaultTurno === 'MAÑANA') {
        setFechaSiguienteApertura(getLocalDateString());
      } else {
        setFechaSiguienteApertura(getTomorrowDate());
      }
    } else {
      setConceptoTx(tipo === 'egreso' ? '' : tipo === 'ajuste' ? 'Ajuste de Caja' : 'Ingreso Manual de Caja');
      setMontoTx('');
      setObservacionTx('');
      setTipoAjusteCaja('INGRESO');
    }
  };

  // Confirmar y guardar la transacción en la base de datos (Ingreso/Egreso simple)
  const confirmarTransaccion = async () => {
    const importeNum = parseFloat(montoTx);
    if (isNaN(importeNum) || importeNum <= 0) {
      alert("Por favor ingrese un importe válido mayor a 0.");
      return;
    }
    if (!conceptoTx.trim()) {
      alert("Por favor ingrese un concepto.");
      return;
    }

    setGuardando(true);
    try {
      const nuevoMov = {
        fecha: fechaTx,
        usuario: usuario || 'Sistema',
        recibido_por: null,
        entregado_por: null,
        turno: null,
        id_turno: null,
        tipo: modalAbierto === 'ajuste' ? tipoAjusteCaja : modalAbierto.toUpperCase(), // 'INGRESO' o 'EGRESO'
        concepto: conceptoTx,
        medio_pago: 'EFECTIVO',
        importe: importeNum.toString(),
        saldo: '0.00', 
        id_pago: null,
        observaciones: observacionTx || null,
        cierre_turno: false
      };

      const { error } = await supabase
        .from('caja_motor')
        .insert([nuevoMov]);

      if (error) throw error;

      alert("Transacción registrada con éxito.");
      setModalAbierto(null);
      await cargarCaja();
    } catch (err) {
      console.error("Error al guardar transacción:", err);
      alert("Error al guardar la transacción: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const imprimirResumenCaja = (fecha, turno, listMovimientos, saldoContado, montoRendido, entregado, recibido, diferencia, motivoDif, saldoRestante) => {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      alert("No se pudo abrir la ventana de impresión. Por favor, habilite los pop-ups para este sitio.");
      return;
    }

    let totalIngresos = 0;
    let totalEgresos = 0;
    let saldoInicial = 0;

    listMovimientos.forEach(m => {
      const tipo = (m.tipo || '').toUpperCase();
      const imp = parseFloat(m.importe) || 0;
      if (tipo === 'INGRESO') totalIngresos += imp;
      else if (tipo === 'EGRESO') totalEgresos += imp;
      else if (m.concepto && m.concepto.toUpperCase().includes('APERTURA')) saldoInicial = imp;
      else if (tipo === 'APERTURA') saldoInicial = imp;
    });

    const rowsHtml = listMovimientos.map(m => {
      const tipo = (m.tipo || '').toUpperCase();
      const imp = parseFloat(m.importe) || 0;
      const debe = (tipo === 'INGRESO' || tipo === 'APERTURA') ? `$${imp.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-';
      const haber = (tipo === 'EGRESO' || tipo === 'CIERRE') ? `$${imp.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-';
      return `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 5px 8px; text-align: left; color: #475569;">${m.fecha ? new Date(m.fecha + 'T00:00:00').toLocaleDateString('es-AR') : '-'}</td>
          <td style="padding: 5px 8px; text-align: left; font-weight: 600; color: #1e293b;">${m.concepto || '-'}</td>
          <td style="padding: 5px 8px; text-align: left; color: #64748b; font-size: 10px; text-transform: uppercase;">${m.medio_pago || 'EFECTIVO'}</td>
          <td style="padding: 5px 8px; text-align: right; font-weight: bold; color: ${tipo === 'INGRESO' || tipo === 'APERTURA' ? '#16a34a' : '#475569'}">${debe}</td>
          <td style="padding: 5px 8px; text-align: right; font-weight: bold; color: ${tipo === 'EGRESO' || tipo === 'CIERRE' ? '#dc2626' : '#475569'}">${haber}</td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
      <html>
        <head>
          <title>Resumen de Caja Diaria - ${fecha} - Turno ${turno}</title>
          <style>
            @page { size: auto; margin: 6mm 8mm; }
            body { font-family: 'Segoe UI', -apple-system, system-ui, sans-serif; color: #1e293b; margin: 0; padding: 0; background: #fff; font-size: 11px; line-height: 1.3; }
            h2 { color: #0f172a; margin: 0; font-size: 16px; font-weight: bold; }
            .grid-info { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
            .card-info { background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; border-radius: 8px; }
            .card-info h4 { margin: 0 0 6px 0; font-size: 11.5px; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 3px; }
            .card-info table { width: 100%; border-collapse: collapse; }
            .card-info td { padding: 3px 0; font-size: 11px; }
            .card-info td.label { font-weight: 600; color: #475569; }
            .card-info td.value { text-align: right; font-weight: bold; color: #0f172a; }
            table.movimientos { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10px; }
            table.movimientos th { background: #f8fafc; padding: 6px 8px; border-bottom: 2px solid #cbd5e1; font-weight: bold; color: #475569; text-align: left; }
            table.movimientos td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
            .footer-notes { margin-top: 15px; font-size: 9.5px; color: #94a3b8; font-style: italic; border-top: 1px solid #e2e8f0; padding-top: 8px; text-align: center; }
            @media print {
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px;">
            <div>
              <h2>📋 Reporte de Cierre y Rendición de Caja</h2>
              <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Sistema CRIN - Resumen de Control Contable</div>
            </div>
            <button onclick="window.print()" style="background: #2563eb; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 11px;">🖨️ Imprimir Reporte</button>
          </div>

          <div class="grid-info">
            <div class="card-info" style="border-color: #bfdbfe; background: #fafcff;">
              <h4 style="color: #1e3a8a; border-bottom-color: #bfdbfe;">Datos Generales</h4>
              <table>
                <tr><td class="label">Fecha de Caja:</td><td class="value">${fecha}</td></tr>
                <tr><td class="label">Turno:</td><td class="value" style="text-transform: uppercase;">${turno}</td></tr>
                <tr><td class="label">Entregado Por:</td><td class="value">${entregado}</td></tr>
                <tr><td class="label">Recibido Por:</td><td class="value">${recibido}</td></tr>
              </table>
            </div>

            <div class="card-info" style="border-color: #a7f3d0; background: #fafdff;">
              <h4 style="color: #065f46; border-bottom-color: #a7f3d0;">Valores Contados y Rendición</h4>
              <table>
                <tr><td class="label">Saldo Inicial del Turno:</td><td class="value">$${saldoInicial.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td></tr>
                <tr><td class="label">Total Ingresos Turno:</td><td class="value" style="color: #16a34a;">+$${totalIngresos.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td></tr>
                <tr><td class="label">Total Egresos Turno:</td><td class="value" style="color: #dc2626;">-$${totalEgresos.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td></tr>
                <tr style="border-top: 1.5px solid #cbd5e1; padding-top: 4px;"><td class="label" style="font-size: 11px; color: #0f172a; font-weight: bold;">Saldo Físico Contado:</td><td class="value" style="font-size: 11.5px; color: #2563eb; font-weight: 800;">$${saldoContado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td></tr>
                <tr><td class="label" style="color: #0f766e;">Monto Rendido a Dirección:</td><td class="value" style="color: #0f766e;">-$${montoRendido.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td></tr>
                <tr style="border-top: 1.5px dashed #cbd5e1; padding-top: 3px;"><td class="label" style="font-weight: bold; color: #0f172a; font-size: 11px;">Saldo Restante (Caja Siguiente):</td><td class="value" style="font-weight: bold; color: #0f172a; font-size: 11px;">$${saldoRestante.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td></tr>
                ${diferencia !== 0 ? `
                  <tr style="color: ${diferencia < 0 ? '#b91c1c' : '#15803d'}; font-weight: bold;">
                    <td class="label" style="color: inherit;">Ajuste Diferencia (${diferencia < 0 ? 'Faltante' : 'Sobrante'}):</td>
                    <td class="value" style="color: inherit;">${diferencia < 0 ? '-' : '+'}$${Math.abs(diferencia).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                  </tr>
                  ${motivoDif ? `<tr><td colspan="2" style="font-size: 10px; color: #b91c1c; font-style: italic; padding-top: 2px;">Motivo Diferencia: ${motivoDif}</td></tr>` : ''}
                ` : ''}
              </table>
            </div>
          </div>

          <h3 style="margin: 10px 0 4px 0; color: #0f172a; font-size: 12px; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 3px; font-weight: bold;">📜 Detalle de Movimientos del Turno</h3>
          <table class="movimientos">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 2px solid #cbd5e1;">
                <th style="width: 100px;">Fecha</th>
                <th>Concepto</th>
                <th style="width: 100px;">Medio de Pago</th>
                <th style="width: 110px; text-align: right;">Ingreso (Debe)</th>
                <th style="width: 110px; text-align: right;">Egreso (Haber)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="footer-notes">
            Reporte de caja emitido por el usuario ${entregado || 'Sistema'} el ${new Date().toLocaleString('es-AR')}.
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 250);
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Procesar cierre de caja completo con rendición y apertura
  const confirmarCierreCaja = async () => {
    const saldoRealNum = parseFloat(saldoRealCierre);
    const montoRendidoNum = parseFloat(montoRendidoCierre);

    if (isNaN(saldoRealNum) || saldoRealNum < 0) {
      alert("Por favor ingrese un saldo real físico válido (mayor o igual a 0).");
      return;
    }
    if (isNaN(montoRendidoNum) || montoRendidoNum < 0 || montoRendidoNum > saldoRealNum) {
      alert("Por favor ingrese un monto a rendir válido (entre 0 y el saldo real contado).");
      return;
    }
    if (!fechaSiguienteApertura) {
      alert("Por favor seleccione la fecha de apertura para el siguiente turno.");
      return;
    }

    setGuardando(true);
    try {
      const saldoTeorico = saldoCajaTotal;
      const diferencia = saldoRealNum - saldoTeorico;
      const saldoRestante = saldoRealNum - montoRendidoNum; // Dinero sobrante que queda en la caja física
      
      const fechaHoy = getLocalDateString();
      const hhmm = new Date().toTimeString().split(' ')[0].substring(0, 5).replace(':', '');
      const autoIdTurno = `${fechaHoy.replace(/-/g, '')}_${hhmm}_${turnoCierre}`;

      // 1. Registrar Ajuste por Diferencia (si la hay) para cuadrar saldo teórico con saldo real físico
      if (diferencia !== 0) {
        const registroAjuste = {
          fecha: fechaHoy,
          usuario: usuario || 'Sistema',
          recibido_por: null,
          entregado_por: null,
          turno: turnoCierre,
          id_turno: autoIdTurno,
          tipo: diferencia < 0 ? 'EGRESO' : 'INGRESO',
          concepto: diferencia < 0 ? 'Faltante de Caja - Ajuste por Cierre' : 'Sobrante de Caja - Ajuste por Cierre',
          medio_pago: 'EFECTIVO',
          importe: Math.abs(diferencia).toString(),
          saldo: '0.00',
          id_pago: null,
          observaciones: motivoDifCierre || (diferencia < 0 ? 'Ajuste por faltante detectado en rendición' : 'Ajuste por sobrante detectado en rendición'),
          cierre_turno: false
        };

        const { error: errAjuste } = await supabase.from('caja_motor').insert([registroAjuste]);
        if (errAjuste) throw errAjuste;
      }

      // 2. Insertar el registro contable de CIERRE
      const registroCierre = {
        fecha: fechaHoy,
        usuario: usuario || 'Sistema',
        recibido_por: recibidoPorCierre || null,
        entregado_por: entregadoPorCierre || null,
        turno: turnoCierre,
        id_turno: autoIdTurno,
        tipo: 'CIERRE',
        concepto: `CIERRE DE CAJA - TURNO ${turnoCierre}`,
        medio_pago: 'EFECTIVO',
        importe: '0',
        saldo: saldoRealNum.toString(),
        id_pago: null,
        observaciones: motivoDifCierre || null,
        cierre_turno: true,
        saldo_turno: saldoRealNum.toString(),
        diferencia: diferencia.toString(),
        motivo_dif: motivoDifCierre || null
      };

      const { error: errCierre } = await supabase.from('caja_motor').insert([registroCierre]);
      if (errCierre) throw errCierre;

      // 3. Registrar el egreso de RENDICION A DIRECCION por la porción de dinero que se entrega físicamente
      if (montoRendidoNum > 0) {
        const registroRendicion = {
          fecha: fechaHoy,
          usuario: usuario || 'Sistema',
          recibido_por: recibidoPorCierre || null,
          entregado_por: entregadoPorCierre || null,
          turno: turnoCierre,
          id_turno: autoIdTurno,
          tipo: 'EGRESO',
          concepto: 'RENDICION A DIRECCION',
          medio_pago: 'EFECTIVO',
          importe: montoRendidoNum.toString(),
          saldo: '0.00',
          id_pago: null,
          observaciones: `Rendición a Dirección por cierre de turno ${turnoCierre}. Quedan $${saldoRestante.toLocaleString('es-AR')} en caja.`,
          cierre_turno: false
        };

        const { error: errRendicion } = await supabase.from('caja_motor').insert([registroRendicion]);
        if (errRendicion) throw errRendicion;
      }

      // 4. Registrar la APERTURA de caja para el día/turno siguiente con el saldo sobrante que se queda físicamente
      const registroAperturaSiguiente = {
        fecha: fechaSiguienteApertura,
        usuario: usuario || 'Sistema',
        recibido_por: null,
        entregado_por: recibidoPorCierre || null,
        turno: turnoCierre === 'MAÑANA' ? 'TARDE' : 'MAÑANA',
        id_turno: `${fechaSiguienteApertura.replace(/-/g, '')}_APERTURA_${turnoCierre === 'MAÑANA' ? 'TARDE' : 'MAÑANA'}`,
        tipo: 'APERTURA',
        concepto: 'APERTURA DE CAJA',
        medio_pago: 'EFECTIVO',
        importe: '0', // El saldo sobrante arrastrado no inyecta dinero nuevo, solo se asienta como carryover
        saldo: saldoRestante.toString(),
        id_pago: null,
        observaciones: `Saldo de apertura arrastrado de la caja del día anterior ($${saldoRestante.toLocaleString('es-AR')} en cambio)`,
        cierre_turno: false,
        saldo_turno: saldoRestante.toString()
      };
      const { error: errApertura } = await supabase.from('caja_motor').insert([registroAperturaSiguiente]);
      if (errApertura) throw errApertura;

      alert("Cierre de caja y apertura de siguiente turno procesados con éxito.");

      const movimientosDeHoy = movimientos.filter(m => m.fecha === fechaHoy);
      imprimirResumenCaja(
        fechaHoy,
        turnoCierre,
        movimientosDeHoy,
        saldoRealNum,
        montoRendidoNum,
        entregadoPorCierre,
        recibidoPorCierre,
        diferencia,
        motivoDifCierre,
        saldoRestante
      );

      setModalAbierto(null);
      await cargarCaja();
    } catch (err) {
      console.error("Error al procesar el cierre de caja:", err);
      alert("Error al procesar el cierre de caja: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  // Filtrar los movimientos según el rango de fechas seleccionado
  const movimientosFiltrados = movimientos.filter(m => m.fecha >= filtroFechaDesde && m.fecha <= filtroFechaHasta);

  // Totales de la fecha seleccionada
  const ingresosDelDia = movimientosFiltrados
    .filter(m => m.tipo === 'INGRESO' || m.tipo === 'APERTURA')
    .reduce((acc, m) => acc + (parseFloat(m.importe) || 0), 0);

  const egresosDelDia = movimientosFiltrados
    .filter(m => m.tipo === 'EGRESO')
    .reduce((acc, m) => acc + (parseFloat(m.importe) || 0), 0);

  const esRango = filtroFechaDesde !== filtroFechaHasta;
  const textoPeriodo = esRango ? 'del Período' : 'del Día';
  const textoPeriodoSub = esRango ? 'Entradas de efectivo en el período' : 'Entradas de efectivo registradas hoy';
  const textoPeriodoSubEg = esRango ? 'Salidas de efectivo en el período' : 'Salidas de efectivo registradas hoy';

  // Diferencia calculada para el modal de cierre
  const diferenciaCalculada = (parseFloat(saldoRealCierre) || 0) - saldoCajaTotal;

  // Dinero que se queda en la caja física al cerrar
  const saldoRestanteEnCaja = Math.max(0, (parseFloat(saldoRealCierre) || 0) - (parseFloat(montoRendidoCierre) || 0));

  return (
    <div style={{ background: '#ffffff', padding: '30px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', fontFamily: 'Segoe UI, system-ui, sans-serif', color: '#1e293b' }}>
      
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '18px', marginBottom: '25px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            💵 Caja Diaria en Efectivo
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
            Visualización, control, egresos y cierres de la caja diaria.
          </p>
        </div>
        <button 
          onClick={onVolver}
          style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', transition: 'all 0.2s' }}
        >
          ← Volver al Menú
        </button>
      </div>

      {/* Tarjetas de Información Financiera */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '25px' }}>
        
        {/* Saldo de Caja Total */}
        <div style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', padding: '20px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Saldo Físico en Caja
          </span>
          <h3 style={{ margin: '8px 0 2px 0', fontSize: '26px', fontWeight: '800', color: '#1e3a8a' }}>
            ${saldoCajaTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </h3>
          <span style={{ fontSize: '11px', color: '#3b82f6' }}>Saldo total acumulado actual</span>
        </div>

        {/* Ingresos de la Fecha */}
        <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', padding: '20px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#166534', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Ingresos {textoPeriodo}
          </span>
          <h3 style={{ margin: '8px 0 2px 0', fontSize: '26px', fontWeight: '800', color: '#14532d' }}>
            +${ingresosDelDia.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </h3>
          <span style={{ fontSize: '11px', color: '#22c55e' }}>{textoPeriodoSub}</span>
        </div>

        {/* Egresos de la Fecha */}
        <div style={{ background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', padding: '20px', borderRadius: '12px', border: '1px solid #fecaca' }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Egresos {textoPeriodo}
          </span>
          <h3 style={{ margin: '8px 0 2px 0', fontSize: '26px', fontWeight: '800', color: '#7f1d1d' }}>
            -${egresosDelDia.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </h3>
          <span style={{ fontSize: '11px', color: '#ef4444' }}>{textoPeriodoSubEg}</span>
        </div>

      </div>

      {/* Panel de Filtros y Acciones */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '15px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '25px' }}>
        
        {/* Selector de Rango de Fechas */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#475569' }}>Desde:</label>
            <input 
              type="date"
              value={filtroFechaDesde}
              onChange={(e) => setFiltroFechaDesde(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none', background: '#ffffff', color: '#0f172a' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#475569' }}>Hasta:</label>
            <input 
              type="date"
              value={filtroFechaHasta}
              onChange={(e) => setFiltroFechaHasta(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none', background: '#ffffff', color: '#0f172a' }}
            />
          </div>
          <button 
            onClick={setHoy}
            style={{ background: '#3b82f6', color: '#ffffff', border: 'none', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', transition: 'background 0.2s', boxShadow: '0 2px 4px rgba(59, 130, 246, 0.1)' }}
            onMouseOver={(e) => e.currentTarget.style.background = '#2563eb'}
            onMouseOut={(e) => e.currentTarget.style.background = '#3b82f6'}
          >
            📅 Hoy
          </button>
        </div>

        {/* Botones de Operación */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => abrirModal('ingreso')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#10b981', color: '#ffffff', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.1)' }}
          >
            ➕ Ingreso Manual
          </button>
          <button
            onClick={() => abrirModal('egreso')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ef4444', color: '#ffffff', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(239, 68, 68, 0.1)' }}
          >
            ➖ Registrar Gasto
          </button>
          <button
            onClick={() => abrirModal('ajuste')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f59e0b', color: '#ffffff', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(245, 158, 11, 0.1)' }}
          >
            ⚙️ Ajuste de Caja
          </button>
          <button
            onClick={() => abrirModal('cierre')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#4f46e5', color: '#ffffff', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(79, 70, 229, 0.1)' }}
          >
            🔒 Cerrar Caja / Rendir
          </button>
          <button
            onClick={() => {
              const cierreRow = movimientosFiltrados.find(m => m.tipo === 'CIERRE');
              const saldoInicialVal = movimientosFiltrados
                .filter(m => m.tipo === 'APERTURA')
                .reduce((sum, m) => sum + (parseFloat(m.importe) || 0), 0);
              const totalIngresosVal = movimientosFiltrados
                .filter(m => m.tipo === 'INGRESO')
                .reduce((sum, m) => sum + (parseFloat(m.importe) || 0), 0);
              const totalEgresosVal = movimientosFiltrados
                .filter(m => m.tipo === 'EGRESO')
                .reduce((sum, m) => sum + (parseFloat(m.importe) || 0), 0);

              const saldoContadoVal = cierreRow ? (parseFloat(cierreRow.saldo_turno) || 0) : (saldoInicialVal + totalIngresosVal - totalEgresosVal);
              const montoRendidoVal = cierreRow ? (parseFloat(cierreRow.importe) || 0) : 0;
              const entregadoVal = cierreRow ? (cierreRow.entregado_por || usuario || 'Sistema') : (usuario || 'Sistema');
              const recibidoVal = cierreRow ? (cierreRow.recibido_por || 'DIRECCIÓN') : 'DIRECCIÓN';
              const diferenciaVal = 0;
              const motivoDifVal = '';
              const saldoRestanteVal = saldoContadoVal - montoRendidoVal;

              imprimirResumenCaja(
                filtroFechaDesde === filtroFechaHasta ? filtroFechaDesde : `${filtroFechaDesde} al ${filtroFechaHasta}`,
                cierreRow ? (cierreRow.turno || 'COMPLETO') : 'ACTUAL',
                movimientosFiltrados,
                saldoContadoVal,
                montoRendidoVal,
                entregadoVal,
                recibidoVal,
                diferenciaVal,
                motivoDifVal,
                saldoRestanteVal
              );
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#06b6d4', color: '#ffffff', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(6, 182, 212, 0.1)' }}
          >
            🖨️ Imprimir Caja
          </button>
        </div>

      </div>

      {/* Modal de Transacción (Ingreso/Egreso/Ajuste) */}
      {modalAbierto && modalAbierto !== 'cierre' && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#ffffff', padding: '25px', borderRadius: '16px', width: '100%', maxWidth: '450px', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>
              {modalAbierto === 'egreso' ? '➖ Registrar Gasto (Egreso)' : modalAbierto === 'ajuste' ? '⚙️ Ajuste de Caja' : '➕ Registrar Ingreso Manual'}
            </h3>

            {modalAbierto === 'ajuste' && (
              <div style={{ marginBottom: '15px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '8px' }}>
                  Tipo de Ajuste *
                </label>
                <div style={{ display: 'flex', gap: '20px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '600', color: '#166534', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="tipoAjusteCaja" 
                      value="INGRESO" 
                      checked={tipoAjusteCaja === 'INGRESO'} 
                      onChange={(e) => setTipoAjusteCaja(e.target.value)} 
                    />
                    ➕ INGRESO (Entrada)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '600', color: '#b91c1c', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="tipoAjusteCaja" 
                      value="EGRESO" 
                      checked={tipoAjusteCaja === 'EGRESO'} 
                      onChange={(e) => setTipoAjusteCaja(e.target.value)} 
                    />
                    ➖ EGRESO (Salida)
                  </label>
                </div>
              </div>
            )}

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Fecha *</label>
              <input 
                type="date"
                value={fechaTx}
                onChange={(e) => setFechaTx(e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Concepto / Motivo *</label>
              <input 
                type="text"
                value={conceptoTx}
                onChange={(e) => setConceptoTx(e.target.value)}
                placeholder={modalAbierto === 'egreso' ? "Ej: Artículos de limpieza, Pago remis, etc." : modalAbierto === 'ajuste' ? "Ej: Error en cobranza paciente X" : "Ej: Carga inicial de caja"}
                style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Importe ($) *</label>
              <input 
                type="number"
                value={montoTx}
                onChange={(e) => setMontoTx(e.target.value)}
                placeholder="Ej: 1500"
                style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Observaciones adicionales</label>
              <textarea 
                value={observacionTx}
                onChange={(e) => setObservacionTx(e.target.value)}
                placeholder="Opcional..."
                style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', height: '60px', resize: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                onClick={() => setModalAbierto(null)}
                disabled={guardando}
                style={{ padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                Cancelar
              </button>
              <button 
                onClick={confirmarTransaccion}
                disabled={guardando}
                style={{ padding: '8px 20px', background: (modalAbierto === 'egreso' || (modalAbierto === 'ajuste' && tipoAjusteCaja === 'EGRESO')) ? '#ef4444' : '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                {guardando ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal de Cierre de Caja / Rendición */}
      {modalAbierto === 'cierre' && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#ffffff', padding: '25px', borderRadius: '16px', width: '100%', maxWidth: '500px', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '18px', fontWeight: 'bold', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🔒 Cierre y Rendición de Caja
            </h3>

            {/* Cuadro de Saldos */}
            <div style={{ background: '#f8fafc', padding: '12px 15px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '15px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#475569' }}>Saldo Teórico del Sistema:</span>
                <span style={{ fontWeight: 'bold', color: '#0f172a' }}>${saldoCajaTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#475569' }}>Saldo Real Físico (Contado):</span>
                <span style={{ fontWeight: 'bold', color: '#0f172a' }}>${(parseFloat(saldoRealCierre) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#0284c7', fontWeight: '500' }}>Monto a Rendir a Dirección:</span>
                <span style={{ fontWeight: 'bold', color: '#0284c7' }}>${(parseFloat(montoRendidoCierre) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#0f766e', fontWeight: '500' }}>Saldo que queda en Caja (Cambio):</span>
                <span style={{ fontWeight: 'bold', color: '#0f766e' }}>${saldoRestanteEnCaja.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', paddingTop: '4px', marginTop: '4px' }}>
                <span style={{ color: '#475569', fontWeight: '600' }}>Diferencia de Arqueo:</span>
                <span style={{ 
                  fontWeight: 'bold', 
                  color: diferenciaCalculada === 0 ? '#166534' : diferenciaCalculada > 0 ? '#b45309' : '#b91c1c' 
                }}>
                  {diferenciaCalculada === 0 ? '$0,00 (Cuadrada)' : diferenciaCalculada > 0 ? `+$${diferenciaCalculada.toLocaleString('es-AR', { minimumFractionDigits: 2 })} (Sobrante)` : `-$${Math.abs(diferenciaCalculada).toLocaleString('es-AR', { minimumFractionDigits: 2 })} (Faltante)`}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>Saldo Real Físico (Contado) *</label>
                <input 
                  type="number"
                  value={saldoRealCierre}
                  onChange={(e) => {
                    setSaldoRealCierre(e.target.value);
                    setMontoRendidoCierre(e.target.value); // Por defecto autocompletar que rinde todo
                  }}
                  placeholder="Ej: 87200"
                  style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>¿Cuánto se rinde a Dir.? *</label>
                <input 
                  type="number"
                  value={montoRendidoCierre}
                  onChange={(e) => setMontoRendidoCierre(e.target.value)}
                  placeholder="Ej: 80000"
                  max={parseFloat(saldoRealCierre) || 0}
                  style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>Entregado Por *</label>
                <input 
                  type="text"
                  value={entregadoPorCierre}
                  onChange={(e) => setEntregadoPorCierre(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>Turno que Cierra *</label>
                <select 
                  value={turnoCierre}
                  onChange={(e) => {
                    const selectedTurno = e.target.value;
                    setTurnoCierre(selectedTurno);
                    if (selectedTurno === 'MAÑANA') {
                      setFechaSiguienteApertura(getLocalDateString());
                    } else {
                      setFechaSiguienteApertura(getTomorrowDate());
                    }
                  }}
                  style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
                >
                  <option value="TARDE">TARDE</option>
                  <option value="MAÑANA">MAÑANA</option>
                  <option value="NOCHE">NOCHE</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>Recibido Por (Rendición) *</label>
                <input 
                  type="text"
                  value={recibidoPorCierre}
                  onChange={(e) => setRecibidoPorCierre(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>Fecha de Apertura Siguiente *</label>
                <input 
                  type="date"
                  value={fechaSiguienteApertura}
                  onChange={(e) => setFechaSiguienteApertura(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>
            </div>

            {diferenciaCalculada !== 0 && (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#991b1b', marginBottom: '4px' }}>Explicación/Motivo de la Diferencia *</label>
                <textarea 
                  value={motivoDifCierre}
                  onChange={(e) => setMotivoDifCierre(e.target.value)}
                  placeholder="Ej: Faltante de $85 por vuelto mal dado..."
                  style={{ width: '100%', padding: '8px', border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '13px', height: '40px', resize: 'none', background: '#fff5f5' }}
                />
              </div>
            )}

            <div style={{ background: '#f0fdf4', padding: '10px 12px', borderRadius: '6px', border: '1px solid #bbf7d0', fontSize: '11px', color: '#166534', marginBottom: '20px' }}>
              ℹ️ Al confirmar: se ajustará la caja al saldo físico contado; se retirará a Dirección el monto a rendir (<strong>${(parseFloat(montoRendidoCierre) || 0).toLocaleString('es-AR')}</strong>); y la caja del siguiente turno abrirá con el saldo restante (<strong>${saldoRestanteEnCaja.toLocaleString('es-AR')}</strong>).
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                onClick={() => setModalAbierto(null)}
                disabled={guardando}
                style={{ padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                Cancelar
              </button>
              <button 
                onClick={confirmarCierreCaja}
                disabled={guardando || (diferenciaCalculada !== 0 && !motivoDifCierre.trim()) || (parseFloat(montoRendidoCierre) > parseFloat(saldoRealCierre))}
                style={{ padding: '8px 20px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                {guardando ? 'Guardando...' : 'Confirmar Cierre y Apertura'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Tabla de Movimientos del Día */}
      <div>
        <h3 style={{ fontSize: '15px', color: '#0f172a', fontWeight: 'bold', margin: '0 0 15px 0' }}>
          📋 Movimientos de la Fecha ({getFiltroFechaLabel()})
        </h3>
        {cargando ? (
          <p style={{ fontSize: '14px', color: '#64748b' }}>Cargando caja...</p>
        ) : movimientosFiltrados.length === 0 ? (
          <p style={{ color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '30px', borderRadius: '12px', textAlign: 'center', border: '1px dashed #cbd5e1' }}>
            No se registran movimientos de caja en esta fecha.
          </p>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', background: '#fff' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '12px 10px' }}>ID</th>
                  <th style={{ padding: '12px 10px' }}>Tipo</th>
                  <th style={{ padding: '12px 10px' }}>Concepto</th>
                  <th style={{ padding: '12px 10px' }}>Usuario</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right' }}>Importe</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right' }}>Saldo Acum.</th>
                  <th style={{ padding: '12px 10px' }}>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {movimientosFiltrados.map((m, idx) => {
                  const imp = parseFloat(m.importe) || 0;
                  return (
                    <tr key={m.id_mov || idx} style={{ borderBottom: '1px solid #e2e8f0', transition: 'background 0.15s' }}>
                      <td style={{ padding: '10px', color: '#64748b', fontWeight: '500' }}>
                        #{m.id_mov || '-'}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <span style={{ 
                          fontSize: '11px', 
                          fontWeight: 'bold', 
                          padding: '3px 8px', 
                          borderRadius: '12px',
                          background: m.tipo === 'INGRESO' ? '#dcfce7' : m.tipo === 'EGRESO' ? '#fecaca' : m.tipo === 'APERTURA' ? '#eff6ff' : m.tipo === 'CIERRE' ? '#f1f5f9' : '#f1f5f9',
                          color: m.tipo === 'INGRESO' ? '#14532d' : m.tipo === 'EGRESO' ? '#7f1d1d' : m.tipo === 'APERTURA' ? '#1e40af' : m.tipo === 'CIERRE' ? '#475569' : '#475569'
                        }}>
                          {m.tipo}
                        </span>
                      </td>
                      <td style={{ padding: '10px', color: '#0f172a', fontWeight: '600' }}>
                        {m.concepto || 'S/D'}
                      </td>
                      <td style={{ padding: '10px', color: '#475569' }}>
                        👤 {m.usuario || 'Sistema'}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', color: (m.tipo === 'INGRESO' || m.tipo === 'APERTURA') ? '#166534' : m.tipo === 'EGRESO' ? '#b91c1c' : '#475569', fontWeight: 'bold' }}>
                        {(m.tipo === 'INGRESO' || m.tipo === 'APERTURA') ? '+' : m.tipo === 'EGRESO' ? '-' : ''}${imp.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', color: '#0f172a', fontWeight: 'bold' }}>
                        ${m.saldoCalculado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '10px', color: '#64748b', fontStyle: m.observaciones ? 'normal' : 'italic' }}>
                        {m.observaciones || m.motivo_dif || '-'}
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
  );
}
