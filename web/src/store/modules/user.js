import { ElMessageBox } from "element-plus";
import { getInfo, login, logout } from "@/api/login";
import defAva from "@/assets/images/profile.png";
import router from "@/router";
import useTagsViewStore from "@/store/modules/tagsView";
import {
  getRefreshToken,
  getToken,
  removeRefreshToken,
  removeToken,
  setRefreshToken,
  setToken,
} from "@/utils/auth";
import { isEmpty, isHttp } from "@/utils/validate";

const useUserStore = defineStore("user", {
  state: () => ({
    token: getToken(),
    refreshToken: getRefreshToken(),
    id: "",
    name: "",
    nickName: "",
    avatar: "",
    roles: [],
    permissions: [],
    consoleMode: "default",
    department: null,
    stockScope: {
      mode: "ALL",
      stockScope: null,
      stockScopeName: null,
    },
    workshopScope: {
      mode: "ALL",
      workshopId: null,
      workshopName: null,
    },
  }),
  actions: {
    setTokens(tokens) {
      const accessToken = tokens?.accessToken;
      const refreshToken = tokens?.refreshToken;
      if (!accessToken || !refreshToken) {
        throw new Error("认证响应缺少访问令牌或刷新令牌");
      }

      setToken(accessToken);
      setRefreshToken(refreshToken);
      this.token = accessToken;
      this.refreshToken = refreshToken;
    },
    clearAuthState() {
      this.token = "";
      this.refreshToken = "";
      this.roles = [];
      this.permissions = [];
      this.consoleMode = "default";
      this.department = null;
      this.stockScope = {
        mode: "ALL",
        stockScope: null,
        stockScopeName: null,
      };
      this.workshopScope = {
        mode: "ALL",
        workshopId: null,
        workshopName: null,
      };
      useTagsViewStore().$reset();
      removeToken();
      removeRefreshToken();
    },
    // 登录
    login(userInfo) {
      const username = userInfo.username.trim();
      const password = userInfo.password;
      const code = userInfo.code;
      const uuid = userInfo.uuid;
      return new Promise((resolve, reject) => {
        login(username, password, code, uuid)
          .then((res) => {
            this.setTokens(res.data);
            resolve();
          })
          .catch((error) => {
            reject(error);
          });
      });
    },
    // 获取用户信息
    getInfo() {
      return new Promise((resolve, reject) => {
        getInfo()
          .then((res) => {
            const user = res.data || {};
            const roles = Array.isArray(user.roles) ? user.roles : [];
            const permissions = Array.isArray(user.permissions)
              ? user.permissions
              : [];
            let avatar = user.avatarUrl || "";
            if (!isHttp(avatar)) {
              avatar = isEmpty(avatar)
                ? defAva
                : import.meta.env.VITE_APP_BASE_API + avatar;
            }
            if (roles.length > 0) {
              this.roles = roles;
              this.permissions = permissions;
            } else {
              this.roles = ["ROLE_DEFAULT"];
              this.permissions = permissions;
            }
            this.id = user.userId;
            this.name = user.username || "";
            this.nickName = user.displayName || user.username || "";
            this.avatar = avatar;
            this.consoleMode = user.consoleMode || "default";
            this.department = user.department || null;
            this.stockScope = user.stockScope || {
              mode: "ALL",
              stockScope: null,
              stockScopeName: null,
            };
            this.workshopScope = user.workshopScope || {
              mode: "ALL",
              workshopId: null,
              workshopName: null,
            };
            if (res.isPasswordExpired) {
              ElMessageBox.confirm(
                "您的密码已过期，请尽快修改密码！",
                "安全提示",
                {
                  confirmButtonText: "确定",
                  cancelButtonText: "取消",
                  type: "warning",
                },
              )
                .then(() => {
                  router.push({
                    name: "Profile",
                    params: { activeTab: "resetPwd" },
                  });
                })
                .catch(() => {});
            }
            resolve(res);
          })
          .catch((error) => {
            reject(error);
          });
      });
    },
    // 退出系统
    logOut() {
      return new Promise((resolve, reject) => {
        logout(this.token)
          .then(() => {
            this.clearAuthState();
            resolve();
          })
          .catch((error) => {
            reject(error);
          });
      });
    },
  },
});

export default useUserStore;
