// ========== LOADER POUR LES COMPOSANTS HEADER ET FOOTER ==========

// Vérifier que Font Awesome est disponible
function waitForFontAwesome() {
    return new Promise((resolve) => {
        const maxAttempts = 20; // 2 secondes max (20 × 100ms)
        let attempts = 0;
        
        const checkFA = () => {
            if (typeof window.FontAwesome !== 'undefined' || typeof fontawesome !== 'undefined') {
                resolve();
            } else if (attempts < maxAttempts) {
                attempts++;
                setTimeout(checkFA, 100);
            } else {
                console.warn('⚠️ Font Awesome n\'a pas pu être chargé après 2s, continuant sans...');
                resolve(); // Continuer anyway
            }
        };
        
        checkFA();
    });
}

// Réinitialiser Font Awesome après insertion de contenu
function reinitFontAwesome() {
    try {
        // Méthode 1: API FontAwesome v6
        if (typeof window.FontAwesome !== 'undefined' && window.FontAwesome.dom) {
            window.FontAwesome.dom.i2svg();
            return true;
        }
        // Méthode 2: API fontawesome globale
        if (typeof fontawesome !== 'undefined' && fontawesome.dom) {
            fontawesome.dom.i2svg();
            return true;
        }
        // Méthode 3: Chercher dans window
        if (typeof window.fontawesome !== 'undefined' && window.fontawesome.dom) {
            window.fontawesome.dom.i2svg();
            return true;
        }
        return false;
    } catch (error) {
        console.warn('⚠️ Erreur réinitialisation Font Awesome:', error.message);
        return false;
    }
}

// Fonction pour charger un composant HTML (avec fallback pour file://)
async function loadComponent(elementId, filePath) {
    try {
        const container = document.getElementById(elementId);
        if (!container) {
            console.warn(`⚠️ Conteneur ${elementId} introuvable`);
            return;
        }

        let html;
        
        // Essayer fetch() d'abord
        try {
            const absolutePath = new URL(filePath, window.location.origin).href;
            const response = await fetch(absolutePath, {
                method: 'GET',
                headers: { 'Accept': 'text/html' }
            });
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status} - ${filePath} non trouvé`);
            }
            html = await response.text();
        } catch (fetchError) {
            // Fallback: utiliser XMLHttpRequest si fetch() échoue (par exemple avec file://)
            console.warn(`⚠️ Fetch() a échoué pour ${filePath}, utilisation de XMLHttpRequest:`, fetchError.message);
            html = await loadComponentWithXHR(filePath);
        }
        
        if (html && html.trim() !== '') {
            container.innerHTML = html;
            console.log(`✓ Component ${elementId} loaded (${html.length} chars)`);
            
            // Réinitialiser Font Awesome APRÈS insertion du contenu
            const faInitialized = reinitFontAwesome();
            if (!faInitialized) {
                console.warn(`⚠️ Font Awesome couldn't be reinitialized for ${elementId}`);
            }
            
            // Déclencher un événement pour signaler que le composant est chargé
            container.dispatchEvent(new CustomEvent('componentLoaded', { 
                detail: { elementId, filePath } 
            }));
        } else {
            console.error(`❌ Le fichier ${filePath} est vide`);
        }
    } catch (error) {
        console.error(`Impossible de charger le composant ${filePath}:`, error);
        // Afficher un message d'erreur dans le conteneur
        const container = document.getElementById(elementId);
        if (container) {
            container.innerHTML = `<!-- Erreur: Impossible de charger ${filePath} -->`;
        }
    }
}

// Fonction de fallback utilisant XMLHttpRequest
function loadComponentWithXHR(filePath) {
    return new Promise((resolve, reject) => {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', filePath, true);
            xhr.setRequestHeader('Accept', 'text/html');
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    // Accepter status 0 (file://) ou 200 (http/https)
                    if (xhr.status === 0 || xhr.status === 200) {
                        if (xhr.responseText && xhr.responseText.trim() !== '') {
                            resolve(xhr.responseText);
                        } else {
                            reject(new Error(`Le fichier ${filePath} est vide`));
                        }
                    } else {
                        reject(new Error(`Erreur XMLHttpRequest: ${xhr.status} ${xhr.statusText}`));
                    }
                }
            };
            xhr.onerror = function() {
                reject(new Error(`Erreur réseau lors du chargement de ${filePath}`));
            };
            xhr.send();
        } catch (error) {
            reject(new Error(`Erreur lors de l'initialisation de XMLHttpRequest: ${error.message}`));
        }
    });
}

// Fonction pour charger tous les composants
async function loadComponents() {
    console.log('Début du chargement des composants...');
    
    // Charger le header, le footer et les contrôles en parallèle pour réduire le rendu bloquant
    const headerContainer = document.getElementById('header-container');
    const footerContainer = document.getElementById('footer-container');

    const headerPromise = headerContainer ? (async () => {
        console.log('Chargement du header...');
        await loadComponent('header-container', 'header/header.html');
        adaptHeaderLinks();
    })() : Promise.resolve();

    const footerPromise = footerContainer ? (async () => {
        console.log('Chargement du footer...');
        await loadComponent('footer-container', 'footer/footer.html');
    })() : Promise.resolve();

    const globalControlsPromise = loadGlobalControls();

    await Promise.all([headerPromise, footerPromise, globalControlsPromise]);

    // Réinitialiser les événements après le chargement
    initializeComponents();
    ensureHeaderConsistency();
    
    // Réinitialiser Font Awesome une dernière fois pour s'assurer que TOUTES les icônes sont converties
    setTimeout(() => {
        reinitFontAwesome();
    }, 100);
    
    // Réinitialiser le menu mobile après chargement des composants (sidebar est maintenant dans le DOM)
    setTimeout(() => {
        console.log('[COMPONENTS-LOADER] Reinitializing mobile menu after components loaded...');
        if (typeof initMobileMenu === 'function') {
            initMobileMenu();
        } else {
            console.error('[COMPONENTS-LOADER] initMobileMenu function not found!');
        }
    }, 150);
    
    console.log('Chargement des composants terminé');
}

// Cache interne pour le chargement des contrôles globaux (pour éviter requêtes répétées)
let globalControlsLoadPromise = null;

// Chargement conditionnel du kit de contrôles global
async function loadGlobalControls() {
    // si déjà présent, ne pas dupliquer (optimisation DOM + vitesse)
    if (document.querySelector('.dark-mode-toggle') && document.getElementById('backToTop') && document.querySelector('.whatsapp-btn')) {
        return;
    }

    // Si déjà en cours de chargement, on attend la promesse existante.
    if (globalControlsLoadPromise) {
        return globalControlsLoadPromise;
    }

    globalControlsLoadPromise = (async function() {
        let controlsContainer = document.getElementById('global-controls-container');
        if (!controlsContainer) {
            controlsContainer = document.createElement('div');
            controlsContainer.id = 'global-controls-container';
            document.body.appendChild(controlsContainer);
        }

        // Si le container est déjà rempli, on considère que c'est déjà fait.
        if (controlsContainer.innerHTML.trim() !== '') {
            console.log('Global controls already rendered');
            return;
        }

        try {
            // Utiliser no-cache pour forcer la validation serveur mais garder le cache browser
            const response = await fetch('components/global-controls.html');
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }
            const html = await response.text();
            if (html && html.trim() !== '') {
                controlsContainer.innerHTML = html;
                console.log('✓ Global controls loaded (optimized)');

                // Réinitialiser Font Awesome pour les icônes
                reinitFontAwesome();

            } else {
                throw new Error('Contenu global-controls vide');
            }
        } catch (error) {
            console.error('Erreur lors du chargement du kit de contrôles global:', error);
            throw error;
        }
    })();

    return globalControlsLoadPromise;
}

function ensureHeaderConsistency() {
    const header = document.querySelector('#header-container .header');
    if (!header) return;

    document.body.classList.add('header-loaded');

    const mobileMenuToggle = header.querySelector('.mobile-menu-toggle');
    if (mobileMenuToggle) {
        mobileMenuToggle.setAttribute('aria-label', 'Ouvrir le menu');
    }
}

// Fonction pour adapter les liens du header selon la page actuelle
function adaptHeaderLinks() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const isIndexPage = currentPage === 'index.html' || currentPage === '';
    
    // Si on est sur la page d'accueil, adapter les liens pour utiliser des ancres
    if (isIndexPage) {
        const navLinks = document.querySelectorAll('.nav-link[data-section]');
        navLinks.forEach(link => {
            const section = link.getAttribute('data-section');
            link.href = `#${section}`;
        });
    }
    // Sinon, garder les liens vers index.html#section
}

// Fonction pour initialiser les composants après chargement
function initializeComponents() {
    // Réinitialiser la navigation
    if (typeof initNavigation === 'function') {
        initNavigation();
    }
    
    // Réinitialiser le back to top
    if (typeof initBackToTop === 'function') {
        initBackToTop();
    }
    
    // Réinitialiser le dark mode
    if (typeof initDarkMode === 'function') {
        initDarkMode();
    }
}

// Fonction d'initialisation principale
function initComponents() {
    console.log('Initialisation des composants...');
    
    // Fonction pour charger les composants
    function attemptLoad() {
        const headerContainer = document.getElementById('header-container');
        const footerContainer = document.getElementById('footer-container');
        
        if (!headerContainer && !footerContainer) {
            console.warn('Conteneurs non trouvés, nouvelle tentative dans 100ms...');
            setTimeout(attemptLoad, 100);
            return;
        }
        
        console.log('Conteneurs trouvés, chargement des composants...');
        loadComponents();
    }
    
    // Vérifier si le DOM est déjà chargé
    if (document.readyState === 'loading') {
        // Le DOM n'est pas encore chargé, attendre
        document.addEventListener('DOMContentLoaded', attemptLoad);
    } else {
        // Le DOM est déjà chargé, charger immédiatement
        attemptLoad();
    }
}

// Initialiser immédiatement
initComponents();

// Exporter les fonctions pour utilisation externe
window.loadComponents = loadComponents;
window.loadComponent = loadComponent;
window.initComponents = initComponents;

