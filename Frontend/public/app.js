(function setupTabs() {
    const sections = ['acceuil', 'llm-test', 'lib-test', 'compare', 'history'];

    function showSection(sectionId) {
        // pour cacher les autres onglets on affiche que le select
        const allSections = document.querySelectorAll('main section[id$="-section"]');
        allSections.forEach((el) => {
            el.style.display = 'none';
        });

        sections.forEach((section) => {
            const el = document.getElementById(`${section}-section`);
            if (el) {
                el.style.display = section === sectionId ? 'block' : 'none';
            }
        });
    }

    function bindTab(buttonId, sectionId) {
        const button = document.getElementById(buttonId);
        if (!button) {
            return;
        }

        button.addEventListener('click', () => showSection(sectionId));
    }

    document.addEventListener('DOMContentLoaded', () => {
        bindTab('nav-acceuil', 'acceuil');
        bindTab('nav-llm-test', 'llm-test');
        bindTab('nav-lib-test', 'lib-test');
        bindTab('nav-compare', 'compare');
        bindTab('nav-history', 'history');

        const connexionButton = document.getElementById('connexion');
        if (connexionButton) {
            connexionButton.addEventListener('click', () => {
                window.location.href = 'connexion.html';
            });
        }
        
        // Onglet par defaut au chargement.
        showSection('acceuil');
    });
})();
