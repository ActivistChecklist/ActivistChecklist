export const prettyPrintObject = (obj) => {
  return <pre>{JSON.stringify(obj, null, 2)}</pre>;
};
