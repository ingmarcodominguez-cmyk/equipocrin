
import { useEffect, useState }
from 'react'

import { supabase }
from '../lib/supabase.js'

function Tasks() {

  const [tasks, setTasks] =
    useState([])

  const [users, setUsers] =
    useState([])

const [rol, setRol] =
  useState('')


  const [titulo, setTitulo] =
    useState('')

  const [
    descripcion,
    setDescripcion
  ] = useState('')

  const [tipo, setTipo] =
    useState('llamada')

  const [
    prioridad,
    setPrioridad
  ] = useState('MEDIA')

  const [
    asignadoA,
    setAsignadoA
  ] = useState('')

  const [
    pacienteNombre,
    setPacienteNombre
  ] = useState('')

  const [vence, setVence] =
    useState('')

  
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

    cargarTasks(
      data.rol,
      user.id
    )
  }

  cargarUsuarios()
}

  



async function cargarTasks(
  rolUsuario,
  userId
) {






    const hoy =

      new Date()
        .toISOString()

    // PASAR A VENCIDA

    await supabase

      .from('tasks')

      .update({
        estado: 'vencida'
      })

      .lt(
        'vence',
        hoy
      )

      .eq(
        'estado',
        'en_proceso'
      )

    
let query =

  supabase

    .from('tasks')

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

  query = query.eq(
    'asignado_a',
    userId
  )
}

const { data } =

  await query

    .order(
      'created_at',
      {
        ascending: false
      }
    )


          {
            ascending: false
          }
        

    if (data) {

      setTasks(data)
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

  function nombreUsuario(
    id
  ) {

    return users.find(
      (u) => u.id == id
    )?.nombre || ''
  }

  async function crearTask() {

    const {

      data: { user }

    } = await supabase.auth
      .getUser()

    await supabase

      .from('tasks')

      .insert([
        {

          titulo,

          descripcion,

          tipo,

          prioridad,

          asignado_a:
            asignadoA,

          creado_por:
            user.id,

          paciente_nombre:
            pacienteNombre,

          vence,

          estado:
            'en_proceso'
        }
      ])

    setTitulo('')
    setDescripcion('')
    setTipo('llamada')
    setPrioridad('MEDIA')
    setAsignadoA('')
    setPacienteNombre('')
    setVence('')

    cargarTasks()
  }

  async function completarTask(
    id
  ) {

    await supabase

      .from('tasks')

      .update({

        estado:
          'completada',

        fecha_completada:
          new Date()
      })

      .eq(
        'id',
        id
      )

    cargarTasks()
  }

  function colorEstado(
    
    estado
  ) {

    if (
      estado ===
      'completada'
    ) {

      return '#d4edda'
    }

    if (
      estado ===
      'vencida'
    ) {

      return '#f8d7da'
    }

    return '#fff3cd'
  }


function colorPrioridad(
  prioridad
) {

  if (
    prioridad ===
    'URGENTE'
  ) {

    return '#dc3545'
  }

  if (
    prioridad ===
    'ALTA'
  ) {

    return '#fd7e14'
  }

  if (
    prioridad ===
    'MEDIA'
  ) {

    return '#ffc107'
  }

  return '#6c757d'
}




  return (

    <div
      style={{
        padding: 20
      }}
    >

      <h1>
        Tareas
      </h1>

      <div

        style={{

          border:
            '1px solid #ccc',

          borderRadius: 10,

          padding: 15,

          marginBottom: 30
        }}
      >

        <input

          placeholder="Título"

          value={titulo}

          onChange={(e) =>
            setTitulo(
              e.target.value
            )
          }
        />

        <br /><br />

        <textarea

          placeholder=
            "Descripción"

          value={descripcion}

          onChange={(e) =>
            setDescripcion(
              e.target.value
            )
          }
        />

        <br /><br />

        <input

          placeholder=
            "Paciente"

          value={pacienteNombre}

          onChange={(e) =>
            setPacienteNombre(
              e.target.value
            )
          }
        />

        <br /><br />

        <select

          value={tipo}

          onChange={(e) =>
            setTipo(
              e.target.value
            )
          }
        >

          <option value="llamada">
            Llamada
          </option>

          <option value="seguimiento">
            Seguimiento
          </option>

          <option value="administrativa">
            Administrativa
          </option>

          <option value="informe">
            Informe
          </option>

          <option value="autorizacion">
            Autorización
          </option>

        </select>

        <br /><br />

        <select

          value={prioridad}

          onChange={(e) =>
            setPrioridad(
              e.target.value
            )
          }
        >

          <option value="BAJA">
            Baja
          </option>

          <option value="MEDIA">
            Media
          </option>

          <option value="ALTA">
            Alta
          </option>

          <option value="URGENTE">
            Urgente
          </option>

        </select>

        <br /><br />

        <select

          value={asignadoA}

          onChange={(e) =>
            setAsignadoA(
              e.target.value
            )
          }
        >

          <option value="">
            Asignar a
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

<label>

  Vencimiento

</label>

<br />


        <input

          type="date"

          value={vence}

          onChange={(e) =>
            setVence(
              e.target.value
            )
          }
        />

        <br /><br />

        <button
          onClick={crearTask}
        >

          Crear tarea

        </button>

      </div>

      {

        tasks.map(
          (task) => (

            <div

              key={task.id}

              style={{

                backgroundColor:
                  colorEstado(
                    task.estado
                  ),

                padding: 15,

                borderRadius: 10,

                marginBottom: 15
              }}
            >

              <h3>

                {task.titulo}

              </h3>

              <p>
                {task.descripcion}
              </p>

              <p>

                Paciente:
                {' '}

                {
                  task.paciente_nombre
                }

              </p>

              <p>

                Tipo:
                {' '}

                {task.tipo}

              </p>

              
<p>

  Prioridad:
  {' '}

  <span

    style={{

      backgroundColor:
        colorPrioridad(
          task.prioridad
        ),

      color:
        'white',

      padding:
        '4px 10px',

      borderRadius:
        20,

      fontWeight:
        'bold'
    }}
  >

    {task.prioridad}

  </span>

</p>



              <p>

                Estado:
                {' '}

                {task.estado}

              </p>

              <p>

                Asignado a:
                {' '}

                {
                  nombreUsuario(
                    task.asignado_a
                  )
                }

              </p>

            
<p>

  Vence:
  {' '}

  {

    new Date(
      task.vence
    ).toLocaleDateString(
      'es-AR'
    )
  }

</p>



              {

                task.estado ===
                  'en_proceso'

                &&

                (

                  <button

                    onClick={() =>
                      completarTask(
                        task.id
                      )
                    }
                  >

                    Completar

                  </button>
                )
              }

            </div>
          )
        )
      }

    </div>
  )
}

export default Tasks

