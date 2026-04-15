export function createTreeMenuManager(options) {
    const {
        btnTreeMenu,
        treeMenu,
        closeExportMenu
    } = options;

    let initialized = false;

    function setup() {
        if (initialized || !btnTreeMenu || !treeMenu) return;
        initialized = true;

        btnTreeMenu.addEventListener('click', (event) => {
            event.stopPropagation();
            toggle();
        });

        document.addEventListener('click', handleOutsideClick);
        document.addEventListener('keydown', handleEscape);
    }

    function toggle() {
        closeExportMenu();
        setOpen(!treeMenu.classList.contains('is-open'));
    }

    function close() {
        setOpen(false);
    }

    function setOpen(isOpen) {
        if (!treeMenu || !btnTreeMenu) return;
        treeMenu.classList.toggle('is-open', isOpen);
        btnTreeMenu.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }

    function handleOutsideClick(event) {
        if (!treeMenu || !btnTreeMenu) return;
        if (treeMenu.contains(event.target)) return;
        if (btnTreeMenu.contains(event.target)) return;
        setOpen(false);
    }

    function handleEscape(event) {
        if (event.key !== 'Escape') return;
        setOpen(false);
    }

    return {
        setup,
        close
    };
}
