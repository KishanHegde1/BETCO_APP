import {
  accountDeletionPage,
  privacyPolicyPage,
  termsAndConditionsPage,
} from './legal.pages';

describe('public legal pages', () => {
  it('links the policy, terms and external deletion request together', () => {
    expect(privacyPolicyPage()).toContain('/terms-and-conditions');
    expect(privacyPolicyPage()).toContain('/account-deletion');
    expect(termsAndConditionsPage()).toContain('/privacy-policy');
    expect(termsAndConditionsPage()).toContain('/account-deletion');
    expect(accountDeletionPage()).toContain('/terms-and-conditions');
  });
});
