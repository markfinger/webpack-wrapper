import debug from 'debug';
import packageJson from '../../package';

export default (name, opts) => {
  let packageName = packageJson.name;
  let id = opts.hash.slice(0, 6);
  return debug(`${packageName}:${id}:${name}`);
};