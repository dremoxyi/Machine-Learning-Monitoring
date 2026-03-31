document.addEventListener('DOMContentLoaded', () => {
    const lastnameInput = document.getElementById('register-lastname');
    const firstnameInput = document.getElementById('register-firstname');
    const emailInput = document.getElementById('register-email');
    const passwordInput = document.getElementById('register-password');
    const submitButton = document.getElementById('register-submit');
    const form = document.getElementById('register-form');
    const client = typeof ApiClient !== 'undefined'
        ? ApiClient
        : {
            request: async (url, options = {}) => {
                const response = await fetch(url, options);
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data?.detail || data?.message || 'Erreur API');
                }
                return data;
            }
        };

    if (!lastnameInput || !firstnameInput || !emailInput || !passwordInput || !submitButton) {
        console.error('Elements du formulaire d\'inscription manquants');
        return;
    }

    async function onRegister(e) {
        e.preventDefault();

        const lastname = lastnameInput.value.trim();
        const firstname = firstnameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (!lastname || !firstname || !email || !password) {
            alert('Veuillez remplir tous les champs');
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = 'Creation...';

        try {
            await client.request('/api/auth/register', {
                method: 'POST',
                body: JSON.stringify({ email, password, firstname, lastname })
            });

            alert('Compte cree avec succes, connectez-vous.');
            window.location.href = 'connexion.html';
        } catch (error) {
            console.error('Register error:', error);
            alert(error.message || 'Erreur de connexion, veuillez reessayer plus tard');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Creer le compte';
        }
    }

    if (form) {
        form.addEventListener('submit', onRegister);
    }
});
