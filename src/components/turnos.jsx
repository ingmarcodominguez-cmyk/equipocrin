
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function Turnos() {

  const [turnos, setTurnos] =
    useState([])

  const [users, setUsers] =
    useState([])

  const [
    filtroProfesional,
    setFiltroProfesional
  ] = useState('')

  const [
    nombrePaciente,
    setNombrePaciente
  ] = useState('')

  const [
    profesionalId,
    setProfesionalId
  ] = useState('')

  const [
    tipoTurno,
    setTipoTurno
  ] = useState('')

  const [
    fecha,
    setFecha
  ] = useState('')

  const [
    hora,
    setHora
  ] = useState('08')

  const [
    minutos,
    setMinutos
  ] = useState('00')

  const [
    observaciones,
    setObservaciones
  ] = useState('')

  useEffect(() => {

    cargarTurnos()
    cargarUsuarios()

  }, [filtroProfesional])

  async function cargarTurnos() {

    let query =

      supabase

        .from('turnos')

        .select('*')

        .eq(
          'estado',
          'agendado'
        )

    if (filtroProfesional) {

      query = query.eq(
        'profesional_id',
        filtroProfesional
      )
    }

    const { data } =

      await query.order(
        'fecha_inicio',
        {
          ascending: true
        }
      )

    if (data) 
      {


console.log(data)



      setTurnos(data)
    }
  }

  async function cargarUsuarios() {

    const { data } =
      await supabase

        .from('users')

        .select('*')

    if (data) {

      setUsers(data)
    }
  }

  async function crearTurno() {

    if (
      !nombrePaciente ||
      !profesionalId ||
      !tipoTurno ||
      !fecha
    ) {

      alert(
        'Completar todos los campos'
      )

      return
    }

    const horaCompleta =

      `${hora}:${minutos}`

    const fechaCompleta =

      `${fecha}T${horaCompleta}:00`

    // VALIDAR SUPERPOSICIÓN

    const { data: existentes } =
      await supabase

        .from('turnos')

        .select('*')

        .eq(
          'profesional_id',
          profesionalId
        )

        .eq(
          'fecha_inicio',
          fechaCompleta
        )

        .eq(
          'estado',
          'agendado'
        )

    if (
      existentes &&
      existentes.length > 0
    ) {

      alert(
        'Ese profesional ya tiene un turno en ese horario'
      )

      return
    }

    // CREAR TURNO

    const { error } =
      await supabase

        .from('turnos')

        .insert([
          {
            profesional_id:
              profesionalId,

            tipo_turno:
              tipoTurno,

            estado:
              'agendado',

            fecha_inicio:
              fechaCompleta,

            observaciones:
              observaciones,

            paciente_nombre:
              nombrePaciente
          }
        ])

    if (error) {

      console.log(error)

      alert(
        'Error creando turno'
      )

    } else {

      alert(
        'Turno creado'
      )

      setNombrePaciente('')
      setProfesionalId('')
      setTipoTurno('')
      setFecha('')
      setHora('08')
      setMinutos('00')
      setObservaciones('')

      cargarTurnos()
    }
  }

  async function editarTurno(
    turno
  ) {

    const nuevaFecha =

      prompt(
        'Nueva fecha YYYY-MM-DD',
        turno.fecha_inicio
          .split('T')[0]
      )

    if (!nuevaFecha)
      return

    const nuevaHora =

      prompt(
        'Nueva hora HH:MM',
        turno.fecha_inicio
          .split('T')[1]
          .substring(0, 5)
      )

    if (!nuevaHora)
      return

    const nuevasObs =

      prompt(
        'Observaciones',
        turno.observaciones || ''
      )

    const fechaCompleta =

      `${nuevaFecha}T${nuevaHora}:00`

    const { error } =
      await supabase

        .from('turnos')

        .update({

          fecha_inicio:
            fechaCompleta,

          observaciones:
            nuevasObs
        })

        .eq('id', turno.id)

    if (error) {

      console.log(error)

      alert(
        'Error editando turno'
      )

    } else {

      alert(
        'Turno actualizado'
      )

      cargarTurnos()
    }
  }

  async function cambiarEstadoTurno(
    id,
    nuevoEstado
  ) {

    const { error } =
      await supabase

        .from('turnos')

        .update({
          estado:
            nuevoEstado
        })

        .eq('id', id)

    if (error) {

      console.log(error)

      alert(
        'Error cambiando estado'
      )

    } else {

      cargarTurnos()
    }
  }

  function obtenerNombreProfesional(
    id
  ) {

    return users.find(
      (u) => u.id === id
    )?.nombre
  }

  return (

    <div
      style={{
        marginBottom: 40
      }}
    >

      <h1>
        Turnos
      </h1>

      <h3>
        Filtrar agenda
      </h3>

      <select

        value={filtroProfesional}

        onChange={(e) =>
          setFiltroProfesional(
            e.target.value
          )
        }
      >

        <option value="">
          Todos los profesionales
        </option>

        {

          users.map(
            (user) => (

              <option

                key={user.id}

                value={user.id}

              >

                {user.nombre}

              </option>
            )
          )
        }

      </select>

      <br /><br />

      <hr />

      <h3>
        Nuevo turno
      </h3>

      <input

        placeholder=
          "Nombre paciente"

        value={nombrePaciente}

        onChange={(e) =>
          setNombrePaciente(
            e.target.value
          )
        }

      />

      <br /><br />

      <select

        value={profesionalId}

        onChange={(e) =>
          setProfesionalId(
            e.target.value
          )
        }
      >

        <option value="">
          Profesional
        </option>

        {

          users.map(
            (user) => (

              <option

                key={user.id}

                value={user.id}

              >

                {user.nombre}

              </option>
            )
          )
        }

      </select>

      <br /><br />

      <select

        value={tipoTurno}

        onChange={(e) =>
          setTipoTurno(
            e.target.value
          )
        }
      >

        <option value="">
          Tipo de turno
        </option>

        <option value="Neurología">
          Neurología
        </option>

        <option value="Dirección">
          Dirección
        </option>

        <option value="Entrenamiento padres">
          Entrenamiento padres
        </option>

        <option value="Entrevista familiar">
          Entrevista familiar
        </option>

        <option value="Reunión escolar">
          Reunión escolar
        </option>

        <option value="Supervisión">
          Supervisión
        </option>

        <option value="Consulta">
          Consulta
        </option>

        <option value="Evaluación">
          Evaluación
        </option>

      </select>

      <br /><br />

      <input

        type="date"

        value={fecha}

        onChange={(e) =>
          setFecha(
            e.target.value
          )
        }

      />

      <br /><br />

      <select

        value={hora}

        onChange={(e) =>
          setHora(
            e.target.value
          )
        }
      >

        {

          Array.from(
            { length: 24 },
            (_, i) => (

              <option
                key={i}
                value={
                  String(i)
                    .padStart(2, '0')
                }
              >

                {
                  String(i)
                    .padStart(2, '0')
                }

              </option>
            )
          )
        }

      </select>

      {' : '}

      <select

        value={minutos}

        onChange={(e) =>
          setMinutos(
            e.target.value
          )
        }
      >

        <option value="00">
          00
        </option>

        <option value="15">
          15
        </option>

        <option value="30">
          30
        </option>

        <option value="45">
          45
        </option>

      </select>

      <br /><br />

      <textarea

        placeholder=
          "Observaciones"

        value={observaciones}

        onChange={(e) =>
          setObservaciones(
            e.target.value
          )
        }

      />

      <br /><br />

      <button
        onClick={crearTurno}
      >
        Crear turno
      </button>

      <hr />

      {

        Object.entries(

          turnos.reduce(
            (grupos, turno) => {

              const fecha =

                new Date(
                  turno.fecha_inicio
                )

                .toLocaleDateString(
                  'es-AR'
                )

              if (!grupos[fecha]) {

                grupos[fecha] = []
              }

              grupos[fecha].push(
                turno
              )

              return grupos

            }, {}
          )

        ).map(

          ([fecha, turnosDia]) => (

            <div key={fecha}>

              <h2>

                {fecha}

              </h2>

              {

                turnosDia

                  .sort(
                    (a, b) =>

                      new Date(
                        a.fecha_inicio
                      )

                      -

                      new Date(
                        b.fecha_inicio
                      )
                  )

                  .map(
                    (turno) => (

                      <div

                        key={turno.id}

                        style={{

                          border:
                            '1px solid gray',

                          padding: 15,

                          marginBottom: 15,

                          borderRadius: 10,

                          backgroundColor:
                            'white'
                        }}
                      >

                        <h3>

                          {
                            turno.tipo_turno
                          }

                        </h3>

                        <p>

                          Paciente:
                          {' '}

                          {
                            turno
                              .paciente_nombre
                          }

                        </p>

                        <p>

                          Profesional:
                          {' '}

                          {
                            obtenerNombreProfesional(
                              turno.profesional_id
                            )
                          }

                        </p>

                        <p>

                          Hora:
                          {' '}

                          {

                            turno.fecha_inicio

                              .split('T')[1]

                              .substring(0, 5)
                          }

                        </p>

                        <p>

                          Estado:
                          {' '}

                          {
                            turno.estado
                          }

                        </p>

                        <button

                          onClick={() =>
                            editarTurno(
                              turno
                            )
                          }
                        >

                          Editar

                        </button>

                        {' '}

                        <button

                          onClick={() =>
                            cambiarEstadoTurno(
                              turno.id,
                              'realizado'
                            )
                          }
                        >

                          Realizado

                        </button>

                        {' '}

                        <button

                          onClick={() =>
                            cambiarEstadoTurno(
                              turno.id,
                              'cancelado'
                            )
                          }
                        >

                          Cancelar

                        </button>

                        <p>

                          Observaciones:
                          {' '}

                          {
                            turno.observaciones
                          }

                        </p>

                      </div>
                    )
                  )
              }

            </div>
          )
        )
      }

    </div>
  )
}

export default Turnos

