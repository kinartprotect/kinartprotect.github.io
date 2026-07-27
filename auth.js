// ============================================
// CONFIGURACIÓN DE SUPABASE
// ============================================
const SUPABASE_URL = 'https://tgeuouzusahpwgjfciko.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnZXVvdXp1c2FocHdnamZjaWtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNzk2NjgsImV4cCI6MjEwMDc1NTY2OH0.dDMkWqsb1t5uYg7z5vLFtXdS3gsLTYbh4r4m_1JBq-o';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// 1. REGISTRO DE USUARIO
// ============================================
async function registrarUsuario(event) {
    event.preventDefault();
    
    const nombreArtista = document.getElementById('regNombreArtista').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    const codigoConfirmacion = document.getElementById('regCodigo').value.trim().toUpperCase();
    
    const messageDiv = document.getElementById('registroMessage');
    
    // Validaciones
    if (!nombreArtista) {
        messageDiv.innerHTML = '<span style="color: #d32f2f;">❌ El nombre del artista es obligatorio</span>';
        return;
    }
    
    if (password !== confirmPassword) {
        messageDiv.innerHTML = '<span style="color: #d32f2f;">❌ Las contraseñas no coinciden</span>';
        return;
    }
    
    if (password.length < 6) {
        messageDiv.innerHTML = '<span style="color: #d32f2f;">❌ La contraseña debe tener al menos 6 caracteres</span>';
        return;
    }
    
    if (!codigoConfirmacion) {
        messageDiv.innerHTML = '<span style="color: #d32f2f;">❌ El código de confirmación es obligatorio</span>';
        return;
    }
    
    try {
        // Verificar código en Supabase
        const { data: codigoData, error: codigoError } = await supabaseClient
            .from('codigos_confirmacion')
            .select('*')
            .eq('codigo', codigoConfirmacion)
            .eq('usado', false)
            .single();
        
        if (codigoError || !codigoData) {
            messageDiv.innerHTML = '<span style="color: #d32f2f;">❌ Código de confirmación inválido o ya utilizado</span>';
            return;
        }
        
        // Registrar usuario en Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    nombre_artista: nombreArtista
                }
            }
        });
        
        if (authError) {
            messageDiv.innerHTML = `<span style="color: #d32f2f;">❌ Error al registrar: ${authError.message}</span>`;
            return;
        }
        
        // Marcar código como usado y guardar nombre
        const { error: updateError } = await supabaseClient
            .from('codigos_confirmacion')
            .update({ 
                usado: true, 
                usuario_id: authData.user.id,
                nombre_artista: nombreArtista,
                fecha_uso: new Date().toISOString()
            })
            .eq('codigo', codigoConfirmacion);
        
        if (updateError) {
            console.error('Error al actualizar código:', updateError);
        }
        
        // Éxito
        messageDiv.innerHTML = `
            <span style="color: #2e7d32;">✅ Registro exitoso! Redirigiendo al login...</span>
        `;
        
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
        
    } catch (error) {
        console.error('Error en registro:', error);
        messageDiv.innerHTML = '<span style="color: #d32f2f;">❌ Error en el registro. Intenta de nuevo.</span>';
    }
}

// ============================================
// 2. LOGIN DE USUARIO
// ============================================
async function login(event) {
    event.preventDefault();
    
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const messageDiv = document.getElementById('loginMessage');
    
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) {
            messageDiv.innerHTML = `<span style="color: #d32f2f;">❌ Error: ${error.message}</span>`;
            return;
        }
        
        // Guardar sesión
        localStorage.setItem('userSession', JSON.stringify({
            user: data.user,
            email: data.user.email,
            nombre_artista: data.user.user_metadata?.nombre_artista || 'Artista'
        }));
        
        messageDiv.innerHTML = '<span style="color: #2e7d32;">✅ Login exitoso! Redirigiendo...</span>';
        
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1500);
        
    } catch (error) {
        console.error('Error en login:', error);
        messageDiv.innerHTML = '<span style="color: #d32f2f;">❌ Error al iniciar sesión</span>';
    }
}

// ============================================
// 3. VERIFICAR SESIÓN (BLOQUEA ACCESO)
// ============================================
async function verificarSesion() {
    const session = localStorage.getItem('userSession');
    
    // Si no hay sesión en localStorage, redirigir al login
    if (!session) {
        window.location.href = 'login.html';
        return false;
    }
    
    try {
        const { data: { session: sessionData }, error } = await supabaseClient.auth.getSession();
        
        if (error || !sessionData) {
            localStorage.removeItem('userSession');
            window.location.href = 'login.html';
            return false;
        }
        
        return true;
        
    } catch (error) {
        console.error('Error verificando sesión:', error);
        window.location.href = 'login.html';
        return false;
    }
}

// ============================================
// 4. CERRAR SESIÓN
// ============================================
async function cerrarSesion() {
    await supabaseClient.auth.signOut();
    localStorage.removeItem('userSession');
    window.location.href = 'login.html';
}

// ============================================
// 5. PROTEGER PÁGINA PRINCIPAL (ACTUALIZADO)
// ============================================
document.addEventListener('DOMContentLoaded', async function() {
    // Detectar si estamos en index.html (página principal)
    // Ahora también detectamos '/index' (sin extensión)
    const esIndex = window.location.pathname.endsWith('index.html') || 
                    window.location.pathname === '/' || 
                    window.location.pathname === '' ||
                    window.location.pathname === '/index'; // <--- NUEVA LÍNEA
    
    if (esIndex) {
        // Verificar sesión y bloquear si no existe
        const sesionValida = await verificarSesion();
        
        if (!sesionValida) {
            // Ya redirige a login desde verificarSesion()
            return;
        }
        
        // Si llegamos aquí, hay sesión válida
        const session = JSON.parse(localStorage.getItem('userSession'));
        if (session && session.email) {
            mostrarInfoUsuario(session);
        }
    }
});

// ============================================
// 6. MOSTRAR INFO DEL USUARIO
// ============================================
function mostrarInfoUsuario(session) {
    const userInfo = document.createElement('div');
    userInfo.style.cssText = `
        text-align: right;
        font-size: 12px;
        color: #7a5a4a;
        margin-bottom: 10px;
        padding: 8px 15px;
        background: #f5f0eb;
        border-radius: 8px;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    
    const nombreMostrar = session.nombre_artista || session.email;
    
    userInfo.innerHTML = `
        <span>🎨 ${nombreMostrar}</span>
        <button onclick="cerrarSesion()" style="
            background: #d32f2f;
            color: white;
            border: none;
            padding: 4px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
        ">Cerrar Sesión</button>
    `;
    
    const container = document.querySelector('.container');
    container.insertBefore(userInfo, container.firstChild);
}