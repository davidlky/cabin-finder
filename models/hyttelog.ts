// @ts-nocheck
const { Model } = require('sequelize');
export default (sequelize, DataTypes) => {
  class HytteLog extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  HytteLog.init(
    {
      hytteId: DataTypes.STRING,
      availableDate: DataTypes.STRING,
    },
    {
      sequelize,
      modelName: 'HytteLog',
    }
  );
  return HytteLog;
};
