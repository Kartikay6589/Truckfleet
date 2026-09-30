function initCustomSelect(select) {
  // 1. Hide the native select
  select.style.display = 'none';

  // 2. Create the custom wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select-wrapper';

  // 3. Create the trigger
  const trigger = document.createElement('div');
  trigger.className = 'custom-select-trigger';

  // Determine the initial text
  const selectedOption = select.options[select.selectedIndex];
  const initialText = selectedOption ? selectedOption.textContent : 'Select...';

  const triggerText = document.createElement('span');
  triggerText.textContent = initialText;

  const triggerArrow = document.createElement('span');
  triggerArrow.className = 'arrow';

  trigger.appendChild(triggerText);
  trigger.appendChild(triggerArrow);
  wrapper.appendChild(trigger);

  // 4. Create the options container
  const optionsContainer = document.createElement('div');
  optionsContainer.className = 'custom-options';

  // 5. Populate options
  Array.from(select.options).forEach(option => {
    const customOption = document.createElement('div');
    customOption.className = 'custom-option';
    if (option.disabled) {
      customOption.style.opacity = '0.5';
      customOption.style.pointerEvents = 'none';
    }

    customOption.textContent = option.textContent;
    customOption.dataset.value = option.value;

    // If this is currently selected natively
    if (select.value === option.value && !option.disabled) {
      customOption.classList.add('selected');
    }

    customOption.addEventListener('click', () => {
      // Update trigger text
      triggerText.textContent = customOption.textContent;

      // Update native select
      select.value = customOption.dataset.value;

      // Remove 'selected' class from all, add to this one
      const allCustomOptions = optionsContainer.querySelectorAll('.custom-option');
      allCustomOptions.forEach(opt => opt.classList.remove('selected'));
      customOption.classList.add('selected');

      // Dispatch change event to trigger existing listeners
      select.dispatchEvent(new Event('change', { bubbles: true }));

      // Close dropdown
      wrapper.classList.remove('open');
    });

    optionsContainer.appendChild(customOption);
  });

  wrapper.appendChild(optionsContainer);

  // 6. Insert into DOM right after the native select
  select.parentNode.insertBefore(wrapper, select.nextSibling);

  // 6b. Keep the custom UI in sync when the native select changes without a
  // click (form.reset(), or code setting select.value)
  const sync = () => {
    const opt = select.options[select.selectedIndex];
    triggerText.textContent = opt ? opt.textContent : 'Select...';
    optionsContainer.querySelectorAll('.custom-option').forEach(o => {
      o.classList.toggle('selected', !!opt && !opt.disabled && o.dataset.value === select.value);
    });
  };
  select._syncCustom = sync;
  if (select.form) select.form.addEventListener('reset', () => setTimeout(sync, 0));

  // 7. Toggle dropdown on trigger click
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    // Close all other open dropdowns first
    document.querySelectorAll('.custom-select-wrapper').forEach(w => {
      if (w !== wrapper) w.classList.remove('open');
    });
    wrapper.classList.toggle('open');
  });

  // 8. Keyboard type-ahead — a real <select> lets you jump to an option by
  // typing its first letter (and cycles through repeats), but that's lost
  // once the native element is hidden behind this custom trigger. Reimplement
  // it here: never writes the typed letter into the box itself, only moves
  // the selection to match it.
  trigger.tabIndex = 0;
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      trigger.click();
      return;
    }
    if (e.key === 'Escape') {
      wrapper.classList.remove('open');
      return;
    }
    if (e.key.length !== 1 || !/[a-z0-9]/i.test(e.key)) return;

    const letter = e.key.toLowerCase();
    const candidates = Array.from(optionsContainer.querySelectorAll('.custom-option'))
      .filter(o => o.style.pointerEvents !== 'none' && o.textContent.trim().toLowerCase().startsWith(letter));
    if (candidates.length === 0) return;

    e.preventDefault();
    const current = optionsContainer.querySelector('.custom-option.selected');
    const currentIdx = current ? candidates.indexOf(current) : -1;
    const next = candidates[(currentIdx + 1) % candidates.length];

    // Same as a real click, minus closing the dropdown while it's open —
    // typing another letter should keep cycling through matches.
    triggerText.textContent = next.textContent;
    select.value = next.dataset.value;
    optionsContainer.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
    next.classList.add('selected');
    select.dispatchEvent(new Event('change', { bubbles: true }));
    next.scrollIntoView({ block: 'nearest' });
  });

  return wrapper;
}

/* For selects whose <option> list changes after page load (e.g. a category
   filter populated from live data) — tears down the old custom dropdown and
   rebuilds it from the select's current options, so the visible UI never
   goes stale while the hidden native select moves on. */
function refreshCustomSelect(select) {
  const existing = select.nextElementSibling;
  if (existing && existing.classList.contains('custom-select-wrapper')) {
    existing.remove();
  }
  initCustomSelect(select);
}

window.refreshCustomSelect = refreshCustomSelect;

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('select').forEach(initCustomSelect);
});

// Close any open dropdown when clicking anywhere outside it — this listener
// lives here (not per-select) so it also covers dropdowns rebuilt later by
// refreshCustomSelect.
document.addEventListener('click', () => {
  document.querySelectorAll('.custom-select-wrapper.open').forEach(w => w.classList.remove('open'));
});
