document.addEventListener('DOMContentLoaded', () => {
    const emailInput = document.getElementById('register-email');
    const passwordInput = document.getElementById('register-password');
    const submitButton = document.getElementById('register-submit');

    if (!emailInput || !passwordInput || !submitButton) {
        console.error('Elements du formulaire d\'inscription manquants');
        return;
    }

    submitButton.addEventListener('click', async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        const role = 'client';

        if (!email || !password) {
            alert('Veuillez remplir tous les champs');
            return;
        }

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password, role })
            });

            const data = await response.json();

            if (!response.ok) {
                alert(data.message || 'Erreur d\'inscription');
                return;
            }

            alert('Compte cree avec succes, connectez-vous.');
            window.location.href = 'connexion.html';
        } catch (error) {
            console.error('Register error:', error);
            alert('Erreur de connexion, veuillez reessayer plus tard');
        }
    });
});
