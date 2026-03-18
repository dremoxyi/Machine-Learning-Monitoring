document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('username');
    const passwordForm = document.getElementById('password');
    const submitButton = document.getElementById('login-submit');

    if (!loginForm || !passwordForm || !submitButton) {
        console.error('Elements du formulaire de connexion manquants');
        return;
    }

    submitButton.addEventListener('click', async (e) => {
        e.preventDefault();

        const email = loginForm.value.trim();
        const password = passwordForm.value.trim();

        if (!email || !password) {
            alert('Veuillez remplir tous les champs');
            return;
        }

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });
        const data = await response.json();

        if (!response.ok) {
            alert(data.message || 'Erreur de connexion');
            return;
        }

        localStorage.setItem('token', data.token);
        localStorage.setItem('role', data.role);

        if (data.role === 'admin') {
            window.location.href = 'admin.html';
        } else {
            window.location.href = 'index.html';
        }

        } catch (error) {
            console.error('Login error:', error);
            alert('Erreur de connexion, veuillez réessayer plus tard');
        }  
    });
});