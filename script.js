// ========== INITIALISATION ==========
document.addEventListener('DOMContentLoaded', function() {
    const initializers = [
        { name: 'loading', run: initLoadingScreen },
        { name: 'dark-mode', run: initDarkMode },
        { name: 'navigation', run: initNavigation },
        { name: 'hero-animations', run: initHeroAnimations },
        { name: 'form-validation', run: initFormValidation },
        { name: 'scroll-animations', run: initScrollAnimations },
        { name: 'back-to-top', run: initBackToTop },
        { name: 'mobile-menu', run: initMobileMenu },
        { name: 'testimonials', run: initTestimonials },
        { name: 'portfolio-carousel', run: initPortfolioCarousel },
        { name: 'faq', run: initFAQ },
        { name: 'reveal-text', run: initRevealText },
        { name: 'cta-buttons', run: initCTAButtons }
    ];

    initializers.forEach(({ name, run }) => {
        try {
            run();
        } catch (error) {
            // silently ignore init errors in production
        }
    });
    
    // Réinitialiser Font Awesome après tous les initializers
    setTimeout(() => {
        if (typeof window.FontAwesome !== 'undefined' && window.FontAwesome.dom) {
            window.FontAwesome.dom.i2svg();
        } else if (typeof fontawesome !== 'undefined' && fontawesome.dom) {
            fontawesome.dom.i2svg();
        }
    }, 200);
});

// ========== LOADING SCREEN ==========
function initLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    
    if (!loadingScreen) return;
    
    function hideLoadingScreen() {
        loadingScreen.classList.add('hidden');
        loadingScreen.style.display = 'none';  // Force immédiate disparition du DOM
        loadingScreen.style.pointerEvents = 'none';  // Aucun clic ne peut la toucher
    }
    
    // Disparaître TRÈS RAPIDEMENT — 800ms max sur mobile (critical pour cliquabilité)
    const loadTimeout = setTimeout(() => {
        if (!loadingScreen.classList.contains('hidden')) {
            hideLoadingScreen();
        }
    }, 800);  // ← Réduit de 3000 à 800ms
    
    // Dès que window.load, immédiatement disparaître
    window.addEventListener('load', function() {
        clearTimeout(loadTimeout);
        hideLoadingScreen();
    });
    
    // DOMContentLoaded fallback (plus rapide que window.load)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            clearTimeout(loadTimeout);
            setTimeout(hideLoadingScreen, 200);
        });
    }
}

// ========== DARK MODE ==========
function initDarkMode() {
    const darkModeToggles = document.querySelectorAll('.dark-mode-toggle');
    const html = document.documentElement;
    
    // Récupérer la préférence sauvegardée ou la préférence système
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme) {
        html.setAttribute('data-theme', savedTheme);
    } else if (prefersDark) {
        html.setAttribute('data-theme', 'dark');
    }
    
    if (!darkModeToggles || darkModeToggles.length === 0) return;

    darkModeToggles.forEach(toggle => {
        // éviter les doubles event listeners
        toggle.replaceWith(toggle.cloneNode(true));
    });

    const freshToggles = document.querySelectorAll('.dark-mode-toggle');
    freshToggles.forEach(darkModeToggle => {
        darkModeToggle.addEventListener('click', function() {
            const currentTheme = html.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            html.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            
            // Afficher une notification
            showToast('success', 'Thème changé', `Mode ${newTheme === 'dark' ? 'sombre' : 'clair'} activé`);
        });
    });
    
    // Écouter les changements de préférence système
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
        if (!localStorage.getItem('theme')) {
            html.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
    });
}

// ========== TOAST NOTIFICATIONS ==========
function showToast(type, title, message, duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle',
        warning: 'fa-exclamation-triangle'
    };
    
    const icon = document.createElement('i');
    icon.className = `fas ${icons[type] || icons.info} toast-icon`;

    const content = document.createElement('div');
    content.className = 'toast-content';
    const titleEl = document.createElement('div');
    titleEl.className = 'toast-title';
    titleEl.textContent = title;
    const msgEl = document.createElement('div');
    msgEl.className = 'toast-message';
    msgEl.textContent = message;
    content.appendChild(titleEl);
    content.appendChild(msgEl);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Fermer');
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';

    toast.appendChild(icon);
    toast.appendChild(content);
    toast.appendChild(closeBtn);
    
    container.appendChild(toast);
    
    // Animation d'entrée
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.5s ease';
    }, 10);
    
    // Fermeture automatique
    const autoClose = setTimeout(() => {
        removeToast(toast);
    }, duration);
    
    // Fermeture manuelle
    closeBtn.addEventListener('click', () => {
        clearTimeout(autoClose);
        removeToast(toast);
    });
    
    return toast;
}

function removeToast(toast) {
    toast.style.animation = 'slideOutRight 0.5s ease';
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 500);
}

// ========== TÉMOIGNAGES CAROUSEL ==========
function initTestimonials() {
    const track = document.getElementById('testimonialsTrack');
    const prevBtn = document.getElementById('testimonialPrev');
    const nextBtn = document.getElementById('testimonialNext');
    const dotsContainer = document.getElementById('testimonialsDots');
    const testimonialsSection = track ? track.closest('.testimonials') : null;
    
    if (!track || !prevBtn || !nextBtn) return;
    
    const cards = Array.from(track.querySelectorAll('.testimonial-card'));
    if (cards.length === 0) return;

    if (cards.length === 1) {
        cards[0].classList.add('active');
        if (dotsContainer) dotsContainer.innerHTML = '';
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        return;
    }

    if (testimonialsSection) {
        testimonialsSection.classList.add('is-carousel');
    }

    let currentIndex = 0;
    
    // Créer les dots
    const dots = [];
    if (dotsContainer) {
        dotsContainer.innerHTML = '';
        cards.forEach((_, index) => {
            const dot = document.createElement('button');
            dot.className = `testimonial-dot ${index === 0 ? 'active' : ''}`;
            dot.setAttribute('aria-label', `Aller au témoignage ${index + 1}`);
            dot.addEventListener('click', () => goToSlide(index));
            dotsContainer.appendChild(dot);
            dots.push(dot);
        });
    }
    
    function updateCarousel() {
        cards.forEach((card, index) => {
            card.classList.toggle('active', index === currentIndex);
        });
        
        track.style.transform = `translateX(-${currentIndex * 100}%)`;
        
        // Mettre à jour les dots
        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === currentIndex);
        });
        
        // Désactiver les boutons aux extrémités
        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex === cards.length - 1;

        // Mettre à jour le compteur
        const counter = document.getElementById('testimonialsCounter');
        if (counter) counter.textContent = `${currentIndex + 1} / ${cards.length}`;
    }
    
    function goToSlide(index) {
        if (index < 0 || index >= cards.length) return;
        currentIndex = index;
        updateCarousel();
    }
    
    function nextSlide() {
        if (currentIndex < cards.length - 1) {
            currentIndex++;
            updateCarousel();
        }
    }
    
    function prevSlide() {
        if (currentIndex > 0) {
            currentIndex--;
            updateCarousel();
        }
    }
    
    prevBtn.addEventListener('click', prevSlide);
    nextBtn.addEventListener('click', nextSlide);
    
    // Auto-play (optionnel)
    let autoPlayInterval;
    function startAutoPlay() {
        autoPlayInterval = setInterval(() => {
            if (currentIndex < cards.length - 1) {
                nextSlide();
            } else {
                goToSlide(0);
            }
        }, 5000);
    }
    
    function stopAutoPlay() {
        clearInterval(autoPlayInterval);
    }
    
    // Pause au survol
    track.addEventListener('mouseenter', stopAutoPlay);
    track.addEventListener('mouseleave', startAutoPlay);
    
    // Swipe pour mobile
    let touchStartX = 0;
    let touchEndX = 0;
    
    track.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        stopAutoPlay();
    });
    
    track.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
        startAutoPlay();
    });
    
    function handleSwipe() {
        const swipeThreshold = 50;
        const diff = touchStartX - touchEndX;
        
        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0) {
                nextSlide();
            } else {
                prevSlide();
            }
        }
    }
    
    // Initialiser
    updateCarousel();
    startAutoPlay();
}

// ========== FAQ ACCORDÉON ==========
function initFAQ() {
    const faqItems = document.querySelectorAll('.faq-item');
    
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        if (!question) return;
        
        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            
            // Fermer tous les autres items
            faqItems.forEach(otherItem => {
                if (otherItem !== item) {
                    otherItem.classList.remove('active');
                    const otherQuestion = otherItem.querySelector('.faq-question');
                    if (otherQuestion) {
                        otherQuestion.setAttribute('aria-expanded', 'false');
                    }
                }
            });
            
            // Toggle l'item actuel
            item.classList.toggle('active', !isActive);
            question.setAttribute('aria-expanded', !isActive ? 'true' : 'false');
        });
    });
}

// ========== REVEAL TEXT ANIMATION ==========
function initRevealText() {
    const revealElements = document.querySelectorAll('.reveal-text');
    
    // Ne pas traiter les éléments qui ont déjà des animations CSS
    const elementsToAnimate = Array.from(revealElements).filter(el => {
        const styles = window.getComputedStyle(el);
        // Skip si déjà animé par CSS
        return !el.style.animation && styles.animation === 'none';
    });
    
    if (elementsToAnimate.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animated');
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });
    
    elementsToAnimate.forEach(element => {
        element.classList.add('reveal-pending');
        observer.observe(element);
    });
}

// ========== NAVIGATION AVANCÉE ==========
function initNavigation() {
    const header = document.querySelector('.header');
    const navLinks = document.querySelectorAll('.nav-link');
    
    // Header scroll effect
    let lastScroll = 0;
    if (header) {
        window.addEventListener('scroll', function() {
            const currentScroll = window.pageYOffset;
            
            if (currentScroll > 50) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
            
            lastScroll = currentScroll;
        });
    }
    
    // Active navigation au scroll
    const sections = document.querySelectorAll('section[id]');

    function updateActiveLinks() {
        const currentHash = window.location.hash || '#accueil';
        const currentPath = window.location.pathname.replace(/\\/g, '/');

        const allLinks = [...document.querySelectorAll('.nav-link'), ...document.querySelectorAll('.sidebar-link')];

        allLinks.forEach(link => {
            const href = link.getAttribute('href');
            let isActive = false;

            if (!href) return;

            if (href.startsWith('#')) {
                // same page anchors
                isActive = href === currentHash;
                // fallback if no hash and homepage concept
                if (!window.location.hash && href === '#accueil') {
                    isActive = true;
                }
            } else {
                const normalizedHref = href.replace(/\\/g, '/');
                if (normalizedHref === currentPath || normalizedHref === currentPath + window.location.hash) {
                    isActive = true;
                }
            }

            if (isActive) {
                link.classList.add('active');
                link.setAttribute('aria-current', 'page');
            } else {
                link.classList.remove('active');
                link.removeAttribute('aria-current');
            }
        });
    }

    window.addEventListener('hashchange', updateActiveLinks);

    window.addEventListener('scroll', function() {
        const scrollPosition = window.scrollY + 150;

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            const sectionId = section.getAttribute('id');
            const navLink = document.querySelector(`.nav-link[href="#${sectionId}"]`);

            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                navLinks.forEach(link => link.classList.remove('active'));
                if (navLink) {
                    navLink.classList.add('active');
                }
            }
        });
    });

    // Set active links on init
    updateActiveLinks();
    
    // Smooth scroll pour les liens de navigation
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            if (href.startsWith('#')) {
                e.preventDefault();
                const targetId = href.substring(1);
                const targetSection = document.getElementById(targetId);
                
                if (targetSection) {
                    const headerHeight = header ? header.offsetHeight : 0;
                    const targetPosition = targetSection.offsetTop - headerHeight;
                    
                    document.body.style.overflow = '';
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });

                    if (targetId === 'services') {
                        document.body.classList.add('stop-hero-animation');
                        document.documentElement.classList.remove('stop-hero-animation');
                    }
                }
            }
        });
    });
}

// ========== MENU MOBILE ==========
let mobileMenuInitialized = false;

function initMobileMenu() {
    if (mobileMenuInitialized) {
        return;
    }

    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const sidebar = document.getElementById('mobileSidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebarClose = document.getElementById('sidebarClose');
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    const body = document.body;
    
    // Silently return if elements aren't found yet (they may load later)
    if (!mobileMenuToggle || !sidebar || !sidebarOverlay) {
        return;
    }
    
    mobileMenuInitialized = true;
    
    function openSidebar() {
        sidebar.classList.add('is-open');
        // Ne pas forcer display en inline - laisser la CSS gérer
        body.style.overflow = 'hidden';
        body.classList.add('menu-is-open');
        document.documentElement.classList.add('menu-is-open');
        const icon = mobileMenuToggle.querySelector('i');
        if (icon) { 
            icon.classList.remove('fa-bars'); 
            icon.classList.add('fa-times');
        }
        mobileMenuToggle.setAttribute('aria-expanded', 'true');
        mobileMenuToggle.setAttribute('aria-label', 'Fermer le menu');
        if (sidebarClose) sidebarClose.focus();
    }
    
    function closeSidebar() {
        sidebar.classList.remove('is-open');
        // Ne pas forcer display en inline - laisser la CSS gérer
        body.style.overflow = '';
        body.classList.remove('menu-is-open');
        document.documentElement.classList.remove('menu-is-open');
        const icon = mobileMenuToggle.querySelector('i');
        if (icon) { 
            icon.classList.add('fa-bars'); 
            icon.classList.remove('fa-times');
        }
        mobileMenuToggle.setAttribute('aria-expanded', 'false');
        mobileMenuToggle.setAttribute('aria-label', 'Ouvrir le menu');
    }
    
    // Event listener pour le bouton hamburger
    mobileMenuToggle.addEventListener('click', function() {
        if (sidebar.classList.contains('is-open')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });
    
    if (sidebarClose) {
        sidebarClose.addEventListener('click', function() {
            closeSidebar();
        });
    }
    
    sidebarLinks.forEach((link) => {
        link.addEventListener('click', function() {
            closeSidebar();
        });
    });

    sidebarOverlay.addEventListener('click', function() {
        closeSidebar();
    });

    // Fermer la sidebar avec la touche ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' || e.key === 'Esc') {
            if (sidebar.classList.contains('is-open')) closeSidebar();
        }
    });
}

// ========== ANIMATIONS HÉRO ==========
function initHeroAnimations() {
    // Les résultats sont immédiatement lisibles, sans effet de compteur à 0.
    createParticles();
}

// ========== PARTICULES ANIMÉES ==========
function createParticles() {
    const heroParticles = document.querySelector('.hero-particles');
    if (!heroParticles) return;
    
    const particleCount = 50;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.cssText = `
            position: absolute;
            width: ${Math.random() * 4 + 2}px;
            height: ${Math.random() * 4 + 2}px;
            background: rgba(255, 255, 255, ${Math.random() * 0.5 + 0.2});
            border-radius: 50%;
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            animation: particleFloat ${Math.random() * 10 + 10}s infinite linear;
            animation-delay: ${Math.random() * 10}s;
        `;
        heroParticles.appendChild(particle);
    }
    
    // Ajouter l'animation CSS pour les particules
    if (!document.querySelector('#particle-animations')) {
        const style = document.createElement('style');
        style.id = 'particle-animations';
        style.textContent = `
            @keyframes particleFloat {
                0% {
                    transform: translateY(0) translateX(0);
                    opacity: 0;
                }
                10% {
                    opacity: 1;
                }
                90% {
                    opacity: 1;
                }
                100% {
                    transform: translateY(-100vh) translateX(${Math.random() * 200 - 100}px);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// ========== VALIDATION FORMULAIRE AVANCÉE ==========
function initFormValidation() {
    const contactForm = document.getElementById('contactForm');
    const submitBtn = document.getElementById('submitBtn');
    const formSuccess = document.getElementById('formSuccess');
    
    if (!contactForm) return;
    
    // Validation en temps réel
    const formInputs = contactForm.querySelectorAll('input, select, textarea');
    
    formInputs.forEach(input => {
        input.addEventListener('blur', function() {
            validateField(this);
        });
        
        input.addEventListener('input', function() {
            if (this.classList.contains('error')) {
                validateField(this);
            }
        });
    });
    
    // Soumission du formulaire
    contactForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Réinitialiser les erreurs
        clearErrors();
        
        // Valider tous les champs
        let isValid = true;
        
        formInputs.forEach(input => {
            if (!validateField(input)) {
                isValid = false;
            }
        });
        
        // Si valide, soumettre
        if (isValid) {
            await submitForm();
        } else {
            // Scroll vers la première erreur
            const firstError = contactForm.querySelector('.error');
            if (firstError) {
                firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                firstError.focus();
            }
        }
    });
    
    function validateField(field) {
        const fieldId = field.id;
        const fieldValue = field.value.trim();
        const errorElement = field.parentElement.querySelector('.error-message');
        
        // Retirer les classes d'erreur précédentes
        field.classList.remove('error');
        if (errorElement) {
            errorElement.textContent = '';
        }
        
        let isValid = true;
        let errorMessage = '';
        
        switch(fieldId) {
            case 'nom':
                if (!fieldValue) {
                    errorMessage = 'Le nom complet est requis';
                    isValid = false;
                } else if (fieldValue.length < 2) {
                    errorMessage = 'Le nom doit contenir au moins 2 caractères';
                    isValid = false;
                } else if (!/^[a-zA-ZÀ-ÿ\s-']+$/.test(fieldValue)) {
                    errorMessage = 'Le nom ne peut contenir que des lettres';
                    isValid = false;
                }
                break;
                
            case 'email':
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!fieldValue) {
                    errorMessage = 'L\'adresse email est requise';
                    isValid = false;
                } else if (!emailRegex.test(fieldValue)) {
                    errorMessage = 'Veuillez entrer une adresse email valide';
                    isValid = false;
                }
                break;
                
            case 'service':
                if (!fieldValue) {
                    errorMessage = 'Veuillez sélectionner un type de service';
                    isValid = false;
                }
                break;
                
            case 'description':
                if (!fieldValue) {
                    errorMessage = 'La description de votre besoin est requise';
                    isValid = false;
                } else if (fieldValue.length < 10) {
                    errorMessage = 'La description doit contenir au moins 10 caractères';
                    isValid = false;
                } else if (fieldValue.length > 1000) {
                    errorMessage = 'La description ne peut pas dépasser 1000 caractères';
                    isValid = false;
                }
                break;
        }
        
        if (!isValid) {
            field.classList.add('error');
            if (errorElement) {
                errorElement.textContent = errorMessage;
            }
        }
        
        return isValid;
    }
    
    function clearErrors() {
        const errorMessages = contactForm.querySelectorAll('.error-message');
        const errorFields = contactForm.querySelectorAll('.error');
        
        errorMessages.forEach(error => {
            error.textContent = '';
        });
        
        errorFields.forEach(field => {
            field.classList.remove('error');
        });
    }
    
    async function submitForm() {
        const btnText = submitBtn.querySelector('.btn-text');
        const btnLoader = submitBtn.querySelector('.btn-loader');

        submitBtn.disabled = true;
        submitBtn.classList.add('disabled');
        btnText.style.display = 'none';
        btnLoader.style.display = 'inline-block';

        try {
            const nom     = contactForm.querySelector('#nom').value.trim();
            const email   = contactForm.querySelector('#email').value.trim();
            const serviceRaw = contactForm.querySelector('#service').value;
            const desc    = contactForm.querySelector('#description').value.trim();
            const serviceMap = { 'creation-site': 'web', 'maintenance': 'maintenance', 'reseaux-sociaux': 'reseaux-sociaux' };
            const serviceRef = serviceMap[serviceRaw] || null;

            const response = await fetch('/api/contact.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nom,
                    email,
                    message: desc,
                    serviceRef,
                    website: contactForm.querySelector('#website')?.value || '',
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.ok) throw new Error(data.error || 'Envoi impossible');

            formSuccess.textContent = '✅ Votre demande a bien été envoyée. Je vous répondrai dans les plus brefs délais.';
            formSuccess.style.display = 'block';
            formSuccess.style.background = '';
            showToast('success', 'Message envoyé !', 'Votre demande a été reçue.');
            contactForm.reset();
            clearErrors();

            setTimeout(() => {
                try {
                    formSuccess.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } catch (e) {
                    window.scrollTo(0, formSuccess.offsetTop - 100);
                }
            }, 200);
            setTimeout(() => {
                formSuccess.style.display = 'none';
            }, 8000);
        } catch (error) {
            formSuccess.innerHTML = '❌ Votre demande n’a pas été envoyée. Réessayez ou <a href="https://wa.me/590690752430?text=Bonjour%2C%20je%20souhaite%20un%20devis" target="_blank" rel="noopener noreferrer" style="color:#fff;text-decoration:underline;font-weight:bold">contactez-moi sur WhatsApp</a>.';
            formSuccess.style.background = 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)';
            formSuccess.style.display = 'block';
            showToast('error', 'Envoi non confirmé', 'Votre demande n’a pas été enregistrée.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.classList.remove('disabled');
            btnText.style.display = 'inline';
            btnLoader.style.display = 'none';
        }
    }
}

// ========== ANIMATIONS AU SCROLL ==========
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    // Observer les éléments avec animation
    const animatedElements = document.querySelectorAll('.service-card, .section-header, .about-text-content, .about-visual');
    animatedElements.forEach(element => {
        element.classList.add('fade-in-up');
        observer.observe(element);
    });
}

// ========== BOUTON BACK TO TOP ==========
function initBackToTop() {
    const backToTopBtn = document.getElementById('backToTop');
    
    if (!backToTopBtn) return;
    
    window.addEventListener('scroll', function() {
        if (window.pageYOffset > 300) {
            backToTopBtn.classList.add('visible');
        } else {
            backToTopBtn.classList.remove('visible');
        }
    });
    
    backToTopBtn.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

// ========== BOUTONS CTA — feedback visuel desktop ==========
function initCTAButtons() {
    // Le feedback tactile est géré par CSS :active (fonctionne partout)
    // Rien de plus nécessaire côté JS
}

// ========== ANIMATIONS DES CARTES SERVICES ==========
document.addEventListener('DOMContentLoaded', function() {
    const serviceCards = document.querySelectorAll('.service-card');
    
    serviceCards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = `opacity 0.6s ease ${index * 0.1}s, transform 0.6s ease ${index * 0.1}s`;
    });
    
    const cardObserver = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });
    
    serviceCards.forEach(card => {
        cardObserver.observe(card);
    });
});

// ========== AMÉLIORATION DES INTERACTIONS ==========
document.addEventListener('DOMContentLoaded', function() {
    // Animation au survol des cartes à propos avec CSS classes
    const aboutCards = document.querySelectorAll('.about-card');
    aboutCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.classList.add('hovered');
        });
        
        card.addEventListener('mouseleave', function() {
            this.classList.remove('hovered');
        });
    });
});

// ========== FILTRE PORTFOLIO ==========
function initPortfolioCarousel() {
    const track = document.getElementById('portfolioTrack');
    const prevBtn = document.getElementById('portfolioPrev');
    const nextBtn = document.getElementById('portfolioNext');
    const dotsContainer = document.getElementById('portfolioDots');
    
    if (!track || !prevBtn || !nextBtn) return;
    
    const items = track.querySelectorAll('.portfolio-item');
    let currentIndex = 0;
    
    // Créer les dots
    const dots = [];
    if (dotsContainer) {
        items.forEach((_, index) => {
            const dot = document.createElement('button');
            dot.className = `portfolio-dot ${index === 0 ? 'active' : ''}`;
            dot.setAttribute('aria-label', `Aller à la réalisation ${index + 1}`);
            dot.addEventListener('click', () => goToSlide(index));
            dotsContainer.appendChild(dot);
            dots.push(dot);
        });
    }
    
    function updateCarousel() {
        items.forEach((item, index) => {
            item.classList.toggle('active', index === currentIndex);
        });
        
        track.style.transform = `translateX(-${currentIndex * 100}%)`;
        
        // Mettre à jour les dots
        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === currentIndex);
        });
        
        // Désactiver les boutons aux extrémités
        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex === items.length - 1;
    }
    
    function goToSlide(index) {
        if (index < 0 || index >= items.length) return;
        currentIndex = index;
        updateCarousel();
    }
    
    function nextSlide() {
        if (currentIndex < items.length - 1) {
            currentIndex++;
            updateCarousel();
        }
    }
    
    function prevSlide() {
        if (currentIndex > 0) {
            currentIndex--;
            updateCarousel();
        }
    }
    
    prevBtn.addEventListener('click', prevSlide);
    nextBtn.addEventListener('click', nextSlide);
    
    // Initialiser
    updateCarousel();
}

// ========== PERFORMANCE: Lazy loading des animations ==========
if ('IntersectionObserver' in window) {
    const lazyElements = document.querySelectorAll('[data-aos]');
    const lazyObserver = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const element = entry.target;
                const animation = element.getAttribute('data-aos');
                element.style.animation = `fadeInUp 0.8s ease ${element.getAttribute('data-aos-delay') || 0}ms both`;
                lazyObserver.unobserve(element);
            }
        });
    });
    
    lazyElements.forEach(element => {
        lazyObserver.observe(element);
    });
}
