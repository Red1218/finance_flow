import type { Transaction } from '../../data/types';
import { validateAmount, validateCategoryType } from '../../domain/transactionRules';
import { ArchivedAccountError, AccountNotFoundError, CategoryNotFoundError } from './errors';
import type { NewTransaction, TransactionPort, AccountLookupPort, CategoryLookupPort, PreferencesPort } from './ports';

export interface CreateTransactionDeps {
  transactions: Pick<TransactionPort, 'create'>;
  accounts: AccountLookupPort;
  categories: CategoryLookupPort;
  preferences: PreferencesPort;
}

export async function createTransaction(input: NewTransaction, deps: CreateTransactionDeps): Promise<Transaction> {
  const precision = await deps.preferences.getDecimalPrecision();
  validateAmount(input.amount, precision);

  const account = await deps.accounts.getById(input.accountId);
  if (!account) throw new AccountNotFoundError();
  if (account.archivedAt) throw new ArchivedAccountError();

  if (input.categoryId) {
    const category = await deps.categories.getById(input.categoryId);
    if (!category) throw new CategoryNotFoundError();
    validateCategoryType(category.kind, input.type);
  }

  return deps.transactions.create(input);
}
