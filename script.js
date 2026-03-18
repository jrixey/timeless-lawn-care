// ================================================
// TIMELESS LAWN CARE — Landing Page Scripts (v2)
// ================================================

// ---- NAVBAR SCROLL EFFECT ----
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// ---- MOBILE HAMBURGER MENU ----
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('navLinks');

hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navLinks.classList.toggle('open');
});

// Close mobile menu when a link is clicked
navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navLinks.classList.remove('open');
    });
});

// ---- SMOOTH SCROLL FOR ANCHOR LINKS ----
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
        }
    });
});

// ---- FAQ ACCORDION ----
document.querySelectorAll('.faq-question').forEach(button => {
    button.addEventListener('click', () => {
        const item = button.parentElement;
        const isActive = item.classList.contains('active');

        // Close all other FAQ items
        document.querySelectorAll('.faq-item').forEach(faq => {
            faq.classList.remove('active');
            faq.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
        });

        // Toggle the clicked item
        if (!isActive) {
            item.classList.add('active');
            button.setAttribute('aria-expanded', 'true');
        }
    });
});

// ---- SCROLL ANIMATIONS (Intersection Observer) ----
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

// Apply fade-in to section content
document.querySelectorAll(
    '.service-card, .why-card, .contact-form, .contact-info, .promo-content, .area-grid, .standard-card, .faq-list, .step-card, .about-content, .about-highlights'
).forEach(el => {
    el.classList.add('fade-in');
    observer.observe(el);
});

// Stagger animation for cards in the same row
document.querySelectorAll('.services-grid, .why-grid, .standard-grid, .steps-grid').forEach(grid => {
    const cards = grid.children;
    Array.from(cards).forEach((card, index) => {
        card.style.transitionDelay = `${index * 0.1}s`;
    });
});

// ---- FORM HANDLING (Formspree) ----
const contactForm = document.getElementById('contactForm');

contactForm.addEventListener('submit', function(e) {
    e.preventDefault();

    const btn = this.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = 'Sending...';
    btn.disabled = true;

    const formData = new FormData(this);

    fetch(this.action, {
        method: 'POST',
        body: formData,
        headers: { 'Accept': 'application/json' }
    })
    .then(response => {
        if (response.ok) {
            contactForm.reset();
            contactForm.innerHTML = `
                <div class="form-success">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#7A917E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    <h3>We Got Your Request!</h3>
                    <p>We'll reach out within 2 hours to confirm details. Usually much faster.</p>
                    <p>Need us sooner? Call or text <a href="tel:8162988348" style="color: #C5A55A; font-weight: 600;">(816) 298-8348</a></p>
                </div>
            `;
        } else {
            throw new Error('Form submission failed');
        }
    })
    .catch(error => {
        btn.textContent = 'Error — Try Again';
        btn.style.background = '#c0392b';
        btn.disabled = false;
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
        }, 3000);
    });
});

// ---- PHONE NUMBER FORMATTING ----
const phoneInput = document.getElementById('phone');
if (phoneInput) {
    phoneInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 6) {
            value = `(${value.slice(0,3)}) ${value.slice(3,6)}-${value.slice(6,10)}`;
        } else if (value.length >= 3) {
            value = `(${value.slice(0,3)}) ${value.slice(3)}`;
        }
        e.target.value = value;
    });
}

// ---- PRE-FILL FROM YARD ANALYZER ----
// When user clicks "Request a Free Estimate" from analyzer results,
// their info is passed as URL params so they don't re-enter it.
(function prefillFromParams() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('name')) return;

    const fields = { name: 'name', phone: 'phone', email: 'email', address: 'address' };
    Object.entries(fields).forEach(([param, id]) => {
        const val = params.get(param);
        const el = document.getElementById(id);
        if (val && el) el.value = val;
    });

    // Clean URL without reloading
    if (window.history.replaceState) {
        window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
})();
