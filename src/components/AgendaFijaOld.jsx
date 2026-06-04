
import {
  useEffect,
  useState
}
from 'react'

import {
  supabase
}
from '../lib/supabase.js'

function AgendaFija() {

  const [agendas, setAgendas] =
    useState([])

  const [users, setUsers] =
    useState([])

  const [rol, setRol] =
    useState('')

  const [
    pacienteNombre,
    setPacienteNombre
  ] = useState('')

  const [
    profesionalId,
    setProfesionalId
  ] = useState('')

  const [
    diaSemana,
    setDiaSemana
  ] = useState('Lunes')

  const [
    horaInicio,
    setHoraInicio
  ] = useState('')

  const [
    horaFin,
    setHoraFin
  ] = useState('')

  const [
    tipoPrestacion,
    setTipoPrestacion
  ] = useState('')

  useEffect(() => {

    iniciar()

  }, [])

  async function iniciar() {

    const {

      data: { user }

    } = await supabase.auth
      .getUser()

    const { data } =

      await supabase

        .from('users')

        .select('*')

        .eq(
          'id',
          user.id
        )

        .single()

    if (data) {

      setRol(
        data.rol
      )

      cargarAgendas(
        data.rol,
        user.id
      )
    }

    cargarUsuarios()
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

  async function cargarAgendas(
    rolUsuario,
    userId
  ) {

    let query =

      supabase

        .from(
          'agendas_fijas'
        )

        .select('*')

    
if (

  rolUsuario
    ?.toLowerCase()
    ===
  'profesional'

  ||

  rolUsuario
    ?.toLowerCase()
    ===
  'auxiliar'
)

 
      {

      query =
        query.eq(
          'profesional_id',
          userId
        )
    }

    const { data } =

      await query

        .order(
          'dia_semana'
        )

    if (data) {

      setAgendas(data)
    }
  }

  async function crearAgenda() {

    await supabase

      .from(
        'agendas_fijas'
      )

      .insert([{

        paciente_nombre:
          pacienteNombre,

        profesional_id:
          profesionalId,

        dia_semana:
          diaSemana,

        hora_inicio:
          horaInicio,

        hora_fin:
          horaFin,

        tipo_prestacion:
          tipoPrestacion
      }])

    setPacienteNombre('')
    setProfesionalId('')
    setHoraInicio('')
    setHoraFin('')
    setTipoPrestacion('')

    iniciar()
  }

  function nombreProfesional(
    id
  ) {

    return users.find(
      (u) => u.id == id
    )?.nombre || ''
  }

  return (

    <div
      style={{
        padding: 20
      }}
    >

      <h1>

        Agenda Fija

      </h1>

      {

        rol
          ?.toLowerCase()

        !==

        'profesional'

        &&

        (

          <div

            style={{

              border:
                '1px solid #ccc',

              padding: 15,

              borderRadius: 10,

              marginBottom: 30
            }}
          >

            <input

              placeholder=
                "Paciente"

              value={
                pacienteNombre
              }

              onChange={(e) =>
                setPacienteNombre(
                  e.target.value
                )
              }
            />

            <br /><br />

            <select

              value={
                profesionalId
              }

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
                  (u) => (

                    <option

                      key={u.id}

                      value={u.id}
                    >

                      {u.nombre}

                    </option>
                  )
                )
              }

            </select>

            <br /><br />

            <select

              value={
                diaSemana
              }

              onChange={(e) =>
                setDiaSemana(
                  e.target.value
                )
              }
            >

              <option>
                Lunes
              </option>

              <option>
                Martes
              </option>

              <option>
                Miércoles
              </option>

              <option>
                Jueves
              </option>

              <option>
                Viernes
              </option>

            </select>

            <br /><br />

            <input

              type="time"

              value={
                horaInicio
              }

              onChange={(e) =>
                setHoraInicio(
                  e.target.value
                )
              }
            />

            <br /><br />

            <input

              type="time"

              value={
                horaFin
              }

              onChange={(e) =>
                setHoraFin(
                  e.target.value
                )
              }
            />

            <br /><br />

            <input

              placeholder=
                "Prestación"

              value={
                tipoPrestacion
              }

              onChange={(e) =>
                setTipoPrestacion(
                  e.target.value
                )
              }
            />

            <br /><br />

            <button
              onClick={
                crearAgenda
              }
            >

              Crear agenda

            </button>

          </div>
        )
      }

      {

        agendas.map(
          (agenda) => (

            <div

              key={agenda.id}

              style={{

                border:
                  '1px solid #ccc',

                borderRadius: 10,

                padding: 15,

                marginBottom: 15
              }}
            >

              <h3>

                {
                  agenda.paciente_nombre
                }

              </h3>

              <p>

                Profesional:
                {' '}

                {
                  nombreProfesional(
                    agenda.profesional_id
                  )
                }

              </p>

              <p>

                Día:
                {' '}

                {
                  agenda.dia_semana
                }

              </p>

              <p>

                Hora:
                {' '}

                {
                  agenda.hora_inicio
                }

                {' - '}

                {
                  agenda.hora_fin
                }

              </p>

              <p>

                Prestación:
                {' '}

                {
                  agenda.tipo_prestacion
                }

              </p>

            </div>
          )
        )
      }

    </div>
  )
}

export default AgendaFija

