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
 *   check.reset();                                  // when the form opens
 *
 * A failed `ok()` also jumps to the first message (scroll + focus). Put
 * `<ErrorSummary errors={errors} />` beside Save for the list.
 *
 * `extra` (optional) adds form-specific messages: `(form) => ({ field: msg })`.
 */
export default function useFieldCheck() {
  const [tried, setTried] = useState(false);
  const all = (form, spec, extra) => ({ ...checkForm(form, spec), ...(extra ? extra(form) : {}) });
  return {
    errors: (form, spec, extra) => (tried ? all(form, spec, extra) : {}),
    ok(form, spec, extra) {
      const bad = hasErrors(all(form, spec, extra));
      setTried(bad);
      // After the messages have rendered: scroll to the first one and focus its field.
      if (bad) setTimeout(jumpToFirstError, 60);
      return !bad;
    },
    reset: () => setTried(false),
  };
}
