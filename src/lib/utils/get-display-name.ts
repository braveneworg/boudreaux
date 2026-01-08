export const getDisplayName = (item: Record<string, unknown>): string => {
  if (item.displayName && typeof item.displayName === 'string') {
    return item.displayName;
  } else if (
    item.firstName &&
    item.surname &&
    typeof item.firstName === 'string' &&
    typeof item.surname === 'string'
  ) {
    return `${item.firstName} ${item.surname}`;
  } else {
    console.error('Unable to determine display name for item:', JSON.stringify(item, null, 2));
    return ' - Error: Unknown entity name';
  }
};
