/**
 * "구간으로 이동" palette command: the text dividers of the scenario as a
 * table of contents to jump by. A code divider is content inside a section,
 * so it is not listed.
 */
import { getDividerTitle, isDivider, isSectionHeading, parseDivider } from './divider-model.js';
import { findNoteInlineTokens } from './note-inline.js';

/** A divider title as one line of plain words: links read as their labels. */
export function plainSectionTitle(title) {
    const line = String(title ?? '').split('\n').find(part => part.trim()) || '';
    let plain = '';
    let cursor = 0;
    findNoteInlineTokens(line).forEach((token) => {
        if (token.type !== 'link') return;
        plain += line.slice(cursor, token.from) + token.label;
        cursor = token.to;
    });
    return (plain + line.slice(cursor)).replace(/\s+/g, ' ').trim();
}

/**
 * The sections in file order: `{ index, title, color, passed, failed, total }`, where
 * `index` is the divider's position among the steps and the counts cover the
 * step rows down to the next text divider.
 */
export function listSections(steps) {
    const sections = [];
    (Array.isArray(steps) ? steps : []).forEach((step, index) => {
        if (isSectionHeading(step?.divider)) {
            sections.push({
                index,
                title: plainSectionTitle(getDividerTitle(step.divider)),
                color: parseDivider(step.divider)?.color || '',
                passed: 0,
                failed: 0,
                total: 0
            });
            return;
        }
        const current = sections[sections.length - 1];
        if (!current || isDivider(step?.divider)) return;
        current.total += 1;
        if (step?.pass === true) current.passed += 1;
        else if (step?.pass === false) current.failed += 1;
    });
    return sections;
}

/** The section a row belongs to: the last heading at or above it, or -1. */
export function findSectionIndexOfRow(sections, rowIndex) {
    let found = -1;
    sections.forEach((section, position) => {
        if (section.index <= rowIndex) found = position;
    });
    return found;
}

/**
 * Sections whose title holds every word of the query, still in file order:
 * a table of contents reads top to bottom, however well a title matches.
 */
export function filterSections(sections, query) {
    const tokens = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    return sections.filter(section => tokens.every(token => section.title.toLowerCase().includes(token)));
}

export function createGoToSectionCommand({ getSections, getCurrentRowIndex, go }) {
    return {
        id: 'goToSection',
        label: '구간으로 이동',
        name: 'Go to Section',
        shortcutId: 'goToSection',
        run: (api) => {
            const sections = getSections();
            const current = findSectionIndexOfRow(sections, getCurrentRowIndex());
            api.pick({
                placeholder: '구간 제목으로 검색...',
                emptyText: sections.length ? '일치하는 구간이 없습니다.' : '이 시나리오에는 구분선이 없습니다.',
                getItems: query => filterSections(sections, query).map(section => ({
                    label: section.title,
                    description: sections[current] === section ? '현재 구간' : '',
                    isCurrent: sections[current] === section,
                    // A section without steps has no progress to show.
                    badge: !section.total ? ''
                        : `${section.passed}/${section.total}${section.failed ? ` · 실패 ${section.failed}` : ''}`,
                    swatch: section.color || 'default',
                    sectionIndex: section.index
                })),
                onSelect: item => go(item.sectionIndex)
            });
        }
    };
}
