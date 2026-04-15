export function createExportMenuManager(options) {
    const {
        el,
        getWorkspace,
        persistWorkspace,
        parseJson,
        closeTreeMenu,
        requiredExportFields,
        exportModeAll,
        exportModeCustom,
        exportModeRequiredLegacy,
        exportModes
    } = options;

    const requiredFieldSet = new Set(requiredExportFields);
    let visibleExportFieldPaths = [];
    let initialized = false;

    function setup() {
        if (initialized || !el.btnExportMenu || !el.exportOptionsMenu) return;
        initialized = true;

        el.btnExportMenu.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleMenu();
        });

        [el.exportModeAll, el.exportModeCustom].filter(Boolean).forEach((input) => {
            input.addEventListener('change', handleModeChange);
        });

        if (el.exportFieldSearch) {
            el.exportFieldSearch.addEventListener('input', renderFieldList);
        }
        if (el.exportFieldList) {
            el.exportFieldList.addEventListener('change', handleFieldSelectionChange);
        }
        if (el.btnExportSelectAll) {
            el.btnExportSelectAll.addEventListener('click', selectVisibleFields);
        }
        if (el.btnExportClearAll) {
            el.btnExportClearAll.addEventListener('click', clearVisibleFields);
        }

        document.addEventListener('click', handleOutsideClick);
        document.addEventListener('keydown', handleEscape);
        syncUiFromWorkspace();
    }

    function syncUiFromWorkspace() {
        const preferences = getExportPreferences();
        setModeInputState(preferences.mode);
        updateMenuVisibility(preferences.mode);
        updateExportButtonLabel(preferences.mode);
        renderFieldList();
    }

    function getExportPreferences() {
        const uiState = getWorkspace()?.uiState || {};
        return {
            mode: normalizeExportMode(uiState.exportMode),
            customFields: normalizeCustomExportFields(uiState.customExportFields)
        };
    }

    function normalizeExportMode(value) {
        if (value === exportModeRequiredLegacy) return exportModeCustom;
        return exportModes.has(value) ? value : exportModeAll;
    }

    function canonicalizeFieldPath(value) {
        if (typeof value !== 'string') return '';
        const trimmed = value.trim();
        if (!trimmed) return '';
        const withoutArrays = trimmed.replace(/\[\]/g, '');
        const normalized = withoutArrays.replace(/\.{2,}/g, '.').replace(/^\.|\.$/g, '');
        return normalized;
    }

    function toggleMenu() {
        setMenuOpen(!el.exportOptionsMenu.classList.contains('is-open'));
    }

    function setMenuOpen(isOpen) {
        if (!el.exportOptionsMenu || !el.btnExportMenu) return;
        el.exportOptionsMenu.classList.toggle('is-open', isOpen);
        el.btnExportMenu.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (isOpen) {
            closeTreeMenu();
            if (el.exportFieldSearch) {
                el.exportFieldSearch.value = '';
            }
            renderFieldList();
        }
    }

    function closeMenu() {
        setMenuOpen(false);
    }

    function handleOutsideClick(event) {
        if (!el.exportOptionsMenu || !el.exportSplit) return;
        if (el.exportSplit.contains(event.target)) return;
        closeMenu();
    }

    function handleEscape(event) {
        if (event.key !== 'Escape') return;
        closeMenu();
    }

    function handleModeChange(event) {
        const nextMode = normalizeExportMode(event?.target?.value);
        const previous = getExportPreferences();
        persistPreferences({ mode: nextMode, customFields: previous.customFields });
        setModeInputState(nextMode);
        updateMenuVisibility(nextMode);
        updateExportButtonLabel(nextMode);
        renderFieldList();
    }

    function setModeInputState(mode) {
        if (el.exportModeAll) el.exportModeAll.checked = mode === exportModeAll;
        if (el.exportModeCustom) el.exportModeCustom.checked = mode === exportModeCustom;
    }

    function updateMenuVisibility(mode) {
        if (!el.exportCustomOptions) return;
        el.exportCustomOptions.classList.toggle('is-hidden', mode !== exportModeCustom);
    }

    function updateExportButtonLabel(mode) {
        if (!el.btnExport) return;
        const modeLabel = mode === exportModeCustom ? '직접 선택' : '전체 필드';
        el.btnExport.title = `Export (${modeLabel})`;
        el.btnExport.setAttribute('aria-label', `Export (${modeLabel})`);
    }

    function normalizeCustomExportFields(fields) {
        if (!Array.isArray(fields)) return [];
        const deduped = new Set();
        fields.forEach((field) => {
            const canonical = canonicalizeFieldPath(field);
            if (!canonical) return;
            if (isRequiredFieldPath(canonical)) return;
            deduped.add(canonical);
        });
        return [...deduped];
    }

    function persistPreferences(preferences) {
        const workspace = getWorkspace();
        if (!workspace?.uiState) return;
        workspace.uiState.exportMode = normalizeExportMode(preferences.mode);
        workspace.uiState.customExportFields = normalizeCustomExportFields(preferences.customFields);
        persistWorkspace();
    }

    function renderFieldList() {
        if (!el.exportFieldList || !el.exportFieldCount || !el.exportFieldEmpty) return;

        const preferences = getExportPreferences();
        const allFields = collectWorkspaceFieldPaths();
        const requiredFields = allFields.filter(isRequiredFieldPath);
        const optionalFields = allFields.filter(field => !isRequiredFieldPath(field));
        const normalizedCustomFields = normalizeHierarchicalSelections(preferences.customFields, optionalFields);
        if (!hasSameFieldSet(preferences.customFields, normalizedCustomFields)) {
            persistPreferences({ mode: preferences.mode, customFields: normalizedCustomFields });
        }

        const query = (el.exportFieldSearch?.value || '').trim().toLowerCase();
        const visibleOptional = query
            ? optionalFields.filter(field => field.toLowerCase().includes(query))
            : optionalFields;
        visibleExportFieldPaths = visibleOptional;

        el.exportFieldList.innerHTML = '';
        if (visibleOptional.length === 0 && query) {
            el.exportFieldEmpty.classList.remove('is-hidden');
        } else {
            el.exportFieldEmpty.classList.add('is-hidden');
        }

        const selectedFields = new Set(normalizedCustomFields);
        const fragment = document.createDocumentFragment();

        requiredFields.forEach((field) => {
            fragment.appendChild(createFieldOption(field, {
                checked: true,
                required: true
            }));
        });

        visibleOptional.forEach((field) => {
            fragment.appendChild(createFieldOption(field, {
                checked: selectedFields.has(field),
                indeterminate: !selectedFields.has(field) && hasSelectedDescendantField(field, selectedFields),
                required: false
            }));
        });

        el.exportFieldList.appendChild(fragment);
        el.exportFieldCount.textContent = `required ${requiredFields.length} (always included) · selected ${selectedFields.size} / optional ${optionalFields.length}`;
    }

    function createFieldOption(field, options = {}) {
        const isRequired = options.required === true;
        const isChecked = isRequired || options.checked === true;
        const isIndeterminate = options.indeterminate === true;
        const label = document.createElement('label');
        label.className = isRequired ? 'export-field-option is-required' : 'export-field-option';
        label.title = isRequired ? 'required field' : field;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.field = field;
        checkbox.checked = isChecked;
        checkbox.disabled = isRequired;
        if (!isRequired) checkbox.indeterminate = isIndeterminate;

        const name = document.createElement('span');
        name.className = 'export-field-name';
        name.textContent = field;

        label.appendChild(checkbox);
        label.appendChild(name);

        if (isRequired) {
            const badge = document.createElement('span');
            badge.className = 'export-required-badge';
            badge.textContent = 'required';
            badge.title = 'required field';
            label.appendChild(badge);
        }

        return label;
    }

    function isRequiredFieldPath(field) {
        const canonical = canonicalizeFieldPath(field);
        return requiredFieldSet.has(canonical);
    }

    function hasSameFieldSet(left, right) {
        if (left.length !== right.length) return false;
        const leftSet = new Set(left);
        for (const field of right) {
            if (!leftSet.has(field)) return false;
        }
        return true;
    }

    function normalizeHierarchicalSelections(fields, allOptionalFields) {
        const optionalSet = new Set(allOptionalFields);
        const normalized = new Set();

        fields.forEach((field) => {
            const canonical = canonicalizeFieldPath(field);
            if (!canonical) return;
            if (!optionalSet.has(canonical)) return;
            normalized.add(canonical);
        });

        const sortedFields = [...allOptionalFields].sort((left, right) => getFieldDepth(right) - getFieldDepth(left));

        sortedFields.forEach((field) => {
            const descendants = getStrictDescendantFieldPaths(field, allOptionalFields);
            if (descendants.length === 0) return;
            if (descendants.every(descendant => normalized.has(descendant))) {
                normalized.add(field);
            } else {
                normalized.delete(field);
            }
        });

        return [...normalized].sort((a, b) => a.localeCompare(b));
    }

    function getFieldDepth(field) {
        if (!field) return 0;
        return field.split('.').filter(Boolean).length;
    }

    function hasSelectedDescendantField(field, selectedFields) {
        const prefix = `${field}.`;
        for (const selected of selectedFields) {
            if (selected.startsWith(prefix)) return true;
        }
        return false;
    }

    function getStrictDescendantFieldPaths(field, allFields) {
        const prefix = `${field}.`;
        return allFields.filter(candidate => candidate.startsWith(prefix));
    }

    function getDescendantFieldPaths(field, allFields) {
        const prefix = `${field}.`;
        return allFields.filter(candidate => candidate === field || candidate.startsWith(prefix));
    }

    function applyFieldSelectionWithHierarchy(selectedFields, field, isChecked, allOptionalFields) {
        const targets = getDescendantFieldPaths(field, allOptionalFields);
        targets.forEach((target) => {
            if (isChecked) {
                selectedFields.add(target);
            } else {
                selectedFields.delete(target);
            }
        });
    }

    function handleFieldSelectionChange(event) {
        const target = event.target;
        if (!target || target.type !== 'checkbox' || target.disabled) return;
        const field = canonicalizeFieldPath(target.dataset.field);
        if (!field) return;

        const preferences = getExportPreferences();
        const selected = new Set(preferences.customFields);
        const allOptionalFields = getOptionalFieldPaths();
        applyFieldSelectionWithHierarchy(selected, field, target.checked, allOptionalFields);
        const normalized = normalizeHierarchicalSelections([...selected], allOptionalFields);
        persistPreferences({ mode: preferences.mode, customFields: normalized });
        renderFieldList();
    }

    function selectVisibleFields() {
        const preferences = getExportPreferences();
        const selected = new Set(preferences.customFields);
        const allOptionalFields = getOptionalFieldPaths();
        visibleExportFieldPaths.forEach((field) => {
            applyFieldSelectionWithHierarchy(selected, field, true, allOptionalFields);
        });
        const normalized = normalizeHierarchicalSelections([...selected], allOptionalFields);
        persistPreferences({ mode: preferences.mode, customFields: normalized });
        renderFieldList();
    }

    function clearVisibleFields() {
        const preferences = getExportPreferences();
        const selected = new Set(preferences.customFields);
        const allOptionalFields = getOptionalFieldPaths();
        visibleExportFieldPaths.forEach((field) => {
            applyFieldSelectionWithHierarchy(selected, field, false, allOptionalFields);
        });
        const normalized = normalizeHierarchicalSelections([...selected], allOptionalFields);
        persistPreferences({ mode: preferences.mode, customFields: normalized });
        renderFieldList();
    }

    function getOptionalFieldPaths() {
        return collectWorkspaceFieldPaths().filter(field => !isRequiredFieldPath(field));
    }

    function collectWorkspaceFieldPaths() {
        const paths = new Set(requiredExportFields);
        const files = Array.isArray(getWorkspace()?.files) ? getWorkspace().files : [];

        files.forEach((file) => {
            const parsed = parseJson(file?.content);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
            collectFieldPaths(parsed, '', paths);
        });

        return [...paths].sort((a, b) => a.localeCompare(b));
    }

    function collectFieldPaths(value, prefix, bucket) {
        if (Array.isArray(value)) {
            if (!prefix) return;
            value.forEach((item) => {
                collectFieldPaths(item, prefix, bucket);
            });
            return;
        }

        if (!value || typeof value !== 'object') return;
        Object.keys(value).forEach((key) => {
            const nextPath = prefix ? `${prefix}.${key}` : key;
            bucket.add(nextPath);
            collectFieldPaths(value[key], nextPath, bucket);
        });
    }

    return {
        setup,
        closeMenu,
        syncUiFromWorkspace,
        getExportPreferences,
        normalizeExportMode,
        canonicalizeFieldPath
    };
}
