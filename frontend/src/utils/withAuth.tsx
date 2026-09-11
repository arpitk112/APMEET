import React, { ComponentType, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const withAuth = <P extends object>(WrappedComponent: ComponentType<P>): React.FC<P> => {
    const AuthComponent: React.FC<P> = (props) => {
        const router = useNavigate();

        const isAuthenticated = (): boolean => {
            return Boolean(localStorage.getItem("token"));
        };

        useEffect(() => {
            if (!isAuthenticated()) {
                router("/auth");
            }
        }, []);

        return <WrappedComponent {...props} />;
    };

    return AuthComponent;
};

export default withAuth;
