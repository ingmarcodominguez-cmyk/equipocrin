
import { useEffect, useState }
from 'react'

import { supabase }
from './lib/supabase.js'





import Layout
from './components/Layout.jsx'



function App() {

  const [session, setSession] =
    useState(null)

    
const [userData, setUserData] =
  useState(null)





  const [email, setEmail] =
    useState('')

  const [password, setPassword] =
    useState('')

  useEffect(() => {

    supabase.auth
      .getSession()

      .then(({ data }) => {

        setSession(
          data.session
        )
      })

    const {

      data: listener

    } = supabase.auth

      .onAuthStateChange(

        (_event, session) => {

          setSession(
            session
          )
        }
      )

    return () => {

      listener.subscription
        .unsubscribe()
    }

  }, [])

  

     
async function login() {

  const { error } =

    await supabase.auth

      .signInWithPassword({

        email,
        password
      })

  
const {

  data: { user }

} = await supabase.auth

  .getUser()

  console.log(user)

const {

  data: perfil

} = await supabase

  .from('users')

  .select('*')

  .eq(
    'id',
    user.id
  )

  .single()

setUserData(
  perfil
)


console.log(perfil)




  if (error) {

    alert(
      'Login incorrecto'
    )
  }
}


  async function logout() {

    await supabase.auth
      .signOut()
  }

  // LOGIN

  if (!session) {

    return (

      <div
        style={{
          padding: 20
        }}
      >

        <h1>
          CRIN
        </h1>

        <input

          type="email"

          placeholder="Email"

          value={email}

          onChange={(e) =>

            setEmail(
              e.target.value
            )
          }
        />

        <br /><br />

        <input

          type="password"

          placeholder="Password"

          value={password}

          onChange={(e) =>

            setPassword(
              e.target.value
            )
          }
        />

        <br /><br />

        <button
          onClick={login}
        >

          Ingresar

        </button>

      </div>
    )
  }

  // SISTEMA

  return (

    <div
      style={{
        padding: 20
      }}
    >


<Layout

  userData={userData}

  logout={logout}

/>

    
    </div>
  )
}

export default App


