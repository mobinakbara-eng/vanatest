(() => {
    const banner = document.querySelector('[data-cookie-banner]');
    const storageKey = 'vana_cookie_prefs';

    if (banner) {
        const openButton = banner.querySelector('[data-cookie-open]');
        const saveButton = banner.querySelector('[data-cookie-save]');
        const acceptButton = banner.querySelector('[data-cookie-accept]');
        const rejectButton = banner.querySelector('[data-cookie-reject]');
        const analyticsInput = banner.querySelector('[data-cookie-analytics]');
        const marketingInput = banner.querySelector('[data-cookie-marketing]');

        const applyPrefs = (prefs) => {
            if (analyticsInput) {
                analyticsInput.checked = !!prefs.analytics;
            }
            if (marketingInput) {
                marketingInput.checked = !!prefs.marketing;
            }
        };

        const savePrefs = (prefs) => {
            try {
                window.localStorage.setItem(storageKey, JSON.stringify(prefs));
            } catch (error) {
                // localStorage might be blocked; ignore silently.
            }
            banner.classList.add('is-hidden');
        };

        let stored = null;
        try {
            stored = window.localStorage.getItem(storageKey);
        } catch (error) {
            stored = null;
        }

        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                applyPrefs(parsed);
                banner.classList.add('is-hidden');
            } catch (error) {
                applyPrefs({ analytics: false, marketing: false });
            }
        }

        if (openButton) {
            openButton.addEventListener('click', () => {
                banner.classList.toggle('is-open');
            });
        }

        if (saveButton) {
            saveButton.addEventListener('click', () => {
                const prefs = {
                    analytics: analyticsInput ? analyticsInput.checked : false,
                    marketing: marketingInput ? marketingInput.checked : false,
                };
                savePrefs(prefs);
            });
        }

        if (acceptButton) {
            acceptButton.addEventListener('click', () => {
                savePrefs({ analytics: true, marketing: true });
            });
        }

        if (rejectButton) {
            rejectButton.addEventListener('click', () => {
                savePrefs({ analytics: false, marketing: false });
            });
        }
    }

    const revealItems = document.querySelectorAll('[data-reveal]');
    if (revealItems.length > 0) {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.15 }
        );

        revealItems.forEach((item) => {
            item.classList.add('reveal');
            observer.observe(item);
        });
    }

    const contactForm = document.querySelector('[data-contact-form]');
    if (contactForm) {
        const message = contactForm.querySelector('[data-form-message]');
        contactForm.addEventListener('submit', (event) => {
            event.preventDefault();
            if (message) {
                message.hidden = false;
            }
            contactForm.reset();
        });
    }
})();
