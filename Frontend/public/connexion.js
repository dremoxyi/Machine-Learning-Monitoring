document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('username');
    const passwordForm = document.getElementById('password');
    const submitButton = document.getElementById('login-submit');
    const form = document.getElementById('connexion-form');
    const client = typeof ApiClient !== 'undefined'
        ? ApiClient
        : {
            clearSession: () => {
                localStorage.removeItem('token');
                localStorage.removeItem('role');
            },
            request: async (url, options = {}) => {
                const response = await fetch(url, options);
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data?.detail || data?.message || 'Erreur API');
                }
                return data;
            }
        };

    if (!loginForm || !passwordForm || !submitButton) {
        console.error('Elements du formulaire de connexion manquants');
        return;
    }

    async function onSubmit(e) {
        e.preventDefault();

        const email = loginForm.value.trim();
        const password = passwordForm.value.trim();

        if (!email || !password) {
            alert('Veuillez remplir tous les champs');
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = 'Chargement...';

        try {
            const data = await client.request('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });

            localStorage.setItem('token', data.token);
            localStorage.setItem('role', data.role);

            if (data.role === 'admin') {
                window.location.href = 'admin.html';
            } else {
                window.location.href = 'index.html';
            }

        } catch (error) {
            console.error('Login error:', error);
            if (error.name === 'AbortError') {
                alert('La requete met trop de temps. Verifiez les services Docker et reessayez.');
            } else {
                alert(error.message || 'Erreur de connexion, veuillez reessayer plus tard');
            }
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Valider';
        }
    }

    if (form) {
        form.addEventListener('submit', onSubmit);
    }
});