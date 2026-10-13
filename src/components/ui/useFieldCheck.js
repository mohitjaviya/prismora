import { useState } from 'react';
import { checkForm, hasErrors } from '../../utils/formRules';
import { jumpToFirstError } from './jumpToError';

/**
 * Messages under the fields, shown once Save has been pressed and kept up to
 * date as the user types, so each one goes away as soon as it is fixed.
 *
 *   const check = useFieldCheck();
 *   const errors = check.errors(form, SPEC);       // in render
 *   if (!check.ok(form, SPEC)) return;              // in the save handler
 *   check.reset();                                  // when a new form opens
 *   check.reset(row);                               // when an existing row is edited
 *
 * A failed `ok()` also jumps to the first message (scroll + focus). Put
 * `<ErrorSummary errors={errors} />` beside Save for the list.
 *
 * `extra` (optional) adds form-specific messages: `(form) => ({ field: msg })`.
 *
 * Editing (`reset(row)`): only the fields changed from the row are checked, as
 * in the database, so an old row's bad value does not block saving the rest.
 * `check.before` is that row, for `cleanForm(form, spec, check.before)`.
 */
export default function useFieldCheck() {
  const [tried, setTried] = useState(false);
  const [before, setBefore] = useState(null);
  const all = (form, spec, extra) => ({ ...checkForm(form, spec, before), ...(extra ? extra(form) : {}) });
  return {
    before,
    errors: (form, spec, extra) => (tried ? all(form, spec, extra) : {}),
    ok(form, spec, extra) {
      const bad = hasErrors(all(form, spec, extra));
      setTried(bad);
      // After the messages have rendered: scroll to the first one and focus its field.
      if (bad) setTimeout(jumpToFirstError, 60);
      return !bad;
    },
    reset: (row = null) => { setTried(false); setBefore(row || null); },
  };
}
